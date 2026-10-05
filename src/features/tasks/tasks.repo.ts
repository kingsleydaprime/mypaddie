import { validateWeights, type PillarWeight } from "@/features/xp/split";
import { completionXp, ignoredNeedDeduction, isLate, type SlipForXp, type TaskForXp } from "@/features/xp/xp";
import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import type { Tier } from "@/shared/domain";
import type { Database, Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import { parseRecurrence, planOccurrences, type SeriesForSpawn } from "./recurrence";

/** How far back catch-up looks for ignored needs and recurring templates. */
const LOOKBACK_DAYS = 14;
const SERIES_LOOKBACK_DAYS = 60;

const TASK_COLUMNS =
  "id, title, status, base_xp, due_at, done_at, is_non_negotiable, item_id, items(tier), task_pillars(pillar, weight)";

type TaskRow = {
  id: string;
  title: string;
  status: TaskForXp["status"];
  base_xp: number;
  due_at: string | null;
  done_at: string | null;
  is_non_negotiable: boolean;
  item_id: string | null;
  items: { tier: Tier } | null;
  task_pillars: PillarWeight[];
};

export interface LoadedTask extends TaskForXp {
  title: string;
  isNonNegotiable: boolean;
  itemId: string | null;
}

function toTask(row: TaskRow): LoadedTask {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    tier: row.items?.tier ?? null,
    baseXp: row.base_xp,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    weights: row.task_pillars,
    isNonNegotiable: row.is_non_negotiable,
    itemId: row.item_id,
  };
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

/** Start of the local day containing `now`, as an instant. */
function startOfToday(now: Date, config: EngineConfig): Date {
  return zonedInstant(dayKey(now, config.timeZone), "00:00", config.timeZone);
}

/** Tasks due from yesterday through the end of today, plus undated open ones. */
export async function loadTasksAroundToday(db: Db, now: Date, config = DEFAULT_CONFIG): Promise<LoadedTask[]> {
  const today = dayKey(now, config.timeZone);
  const from = zonedInstant(addDays(today, -1), "00:00", config.timeZone).toISOString();
  const to = zonedInstant(addDays(today, 1), "00:00", config.timeZone).toISOString();
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .or(`and(due_at.gte.${from},due_at.lt.${to}),and(due_at.is.null,status.in.(pending,skipped))`)
    .returns<TaskRow[]>();
  if (error) fail("loading today's tasks", error);
  return data.map(toTask);
}

/** Needs that were due before today and are still open — candidates for "ignored". */
export async function loadOpenPastNeeds(
  db: Db,
  now: Date,
  config = DEFAULT_CONFIG,
): Promise<{ tasks: LoadedTask[]; slips: SlipForXp[] }> {
  const todayStart = startOfToday(now, config);
  const since = new Date(todayStart.getTime() - LOOKBACK_DAYS * 86_400_000);
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS.replace("items(tier)", "items!inner(tier)"))
    .eq("items.tier", "need")
    .in("status", ["pending", "skipped"])
    .gte("due_at", since.toISOString())
    .lt("due_at", todayStart.toISOString())
    .returns<TaskRow[]>();
  if (error) fail("loading past needs", error);

  const tasks = data.map(toTask);
  if (tasks.length === 0) return { tasks, slips: [] };

  const { data: slips, error: slipError } = await db
    .from("slips")
    .select("task_id, accepted")
    .in(
      "task_id",
      tasks.map((t) => t.id),
    );
  if (slipError) fail("loading slips", slipError);
  return { tasks, slips: slips.map((s) => ({ taskId: s.task_id, accepted: s.accepted })) };
}

export interface CatchUpResult {
  spawned: number;
  /** XP rows written for ignored needs (0 on every run after the first). */
  deductions: number;
}

/**
 * Brings the database up to date with "now" before anything is shown:
 * creates any due recurring rows, then deducts for needs whose day ended
 * without being done or excused. Safe to run any number of times, even
 * concurrently — the database refuses duplicates.
 */
export async function catchUp(db: Db, now: Date, config = DEFAULT_CONFIG): Promise<CatchUpResult> {
  // 1. Recurring rows: latest row of each series is the template.
  const since = addDays(dayKey(now, config.timeZone), -SERIES_LOOKBACK_DAYS);
  const { data: rows, error } = await db
    .from("tasks")
    .select("series_id, occurs_on, due_at, recurrence")
    .not("series_id", "is", null)
    .gte("occurs_on", since)
    .order("occurs_on", { ascending: false });
  if (error) fail("loading recurring tasks", error);

  const latest = new Map<string, SeriesForSpawn>();
  for (const r of rows) {
    if (!r.series_id || !r.occurs_on || !r.recurrence || latest.has(r.series_id)) continue;
    latest.set(r.series_id, {
      seriesId: r.series_id,
      rule: r.recurrence,
      lastOccursOn: r.occurs_on,
      lastDueAt: r.due_at ? new Date(r.due_at) : null,
    });
  }

  let spawned = 0;
  for (const o of planOccurrences([...latest.values()], now, 7, config)) {
    const { data: id, error: spawnError } = await db.rpc("spawn_occurrence", {
      p_series_id: o.seriesId,
      p_occurs_on: o.occursOn,
      p_due_at: o.dueAt?.toISOString() ?? (null as unknown as string),
    });
    if (spawnError) fail("spawning a recurring task", spawnError);
    if (id) spawned += 1;
  }

  // 2. Ignored needs (including rows just backfilled for missed days).
  const { tasks, slips } = await loadOpenPastNeeds(db, now, config);
  const entries = tasks.flatMap((t) =>
    ignoredNeedDeduction(t, slips, now, config).map((e) => ({ ...e, task_id: t.id })),
  );
  let deductions = 0;
  if (entries.length > 0) {
    const { data: inserted, error: awardError } = await db.rpc("award_xp", { p_entries: entries as unknown as Json });
    if (awardError) fail("recording ignored-need deductions", awardError);
    deductions = inserted;
  }
  return { spawned, deductions };
}

export type CompleteResult =
  | { result: "completed"; xp: number; late: boolean; title: string }
  | { result: "already_done" | "cancelled" | "not_found"; title: string | null };

/** Marks a task done and pays its weighted XP, atomically and at most once. */
export async function completeTask(db: Db, taskId: string, now: Date, config = DEFAULT_CONFIG): Promise<CompleteResult> {
  const { data, error } = await db.from("tasks").select(TASK_COLUMNS).eq("id", taskId).returns<TaskRow[]>().maybeSingle();
  if (error) fail("loading the task", error);
  if (!data) return { result: "not_found", title: null };

  const task = toTask(data);
  if (task.status === "done") return { result: "already_done", title: task.title };
  if (task.status === "cancelled") return { result: "cancelled", title: task.title };

  const entries = completionXp(task, now, config);
  const { data: outcome, error: rpcError } = await db.rpc("complete_task", {
    p_task_id: taskId,
    p_done_at: now.toISOString(),
    p_entries: entries as unknown as Json,
  });
  if (rpcError) fail("completing the task", rpcError);

  const result = (outcome as { result: string }).result;
  if (result !== "completed") return { result: result as "already_done", title: task.title };
  return {
    result: "completed",
    xp: entries.reduce((sum, e) => sum + e.amount, 0),
    late: isLate(task, now),
    title: task.title,
  };
}

export interface NewTask {
  title: string;
  itemId: string | null;
  baseXp: number;
  /** Local date "YYYY-MM-DD"; defaults to today. */
  dueDate: string | null;
  /** Local time "HH:MM"; null = any time that day. */
  dueTime: string | null;
  /** RRULE subset; null = one-off. */
  recurrence: string | null;
  nonNegotiable: boolean;
  weights: PillarWeight[];
}

/**
 * Creates a task and its pillar weights. Weights and recurrence are validated
 * before anything is written; if the weights insert still fails, the task row
 * is removed again so there's never a task that can't pay XP.
 */
export async function createTask(db: Db, task: NewTask, now: Date, config = DEFAULT_CONFIG) {
  validateWeights(task.weights);
  if (task.recurrence) parseRecurrence(task.recurrence);

  const day = task.dueDate ?? dayKey(now, config.timeZone);
  const dueAt = task.dueTime ? zonedInstant(day, task.dueTime, config.timeZone) : task.dueDate ? zonedInstant(day, "23:59", config.timeZone) : null;

  const { data, error } = await db
    .from("tasks")
    .insert({
      title: task.title,
      item_id: task.itemId,
      base_xp: task.baseXp,
      due_at: dueAt?.toISOString() ?? null,
      recurrence: task.recurrence,
      is_non_negotiable: task.nonNegotiable,
      series_id: task.recurrence ? crypto.randomUUID() : null,
      occurs_on: task.recurrence ? day : null,
    })
    .select("id, title, due_at, recurrence")
    .single();
  if (error) fail("creating the task", error);

  const { error: weightError } = await db
    .from("task_pillars")
    .insert(task.weights.map((w) => ({ task_id: data.id, pillar: w.pillar, weight: w.weight })));
  if (weightError) {
    await db.from("tasks").delete().eq("id", data.id);
    fail("saving pillar weights", weightError);
  }
  return data;
}

export interface TaskChanges {
  title?: string;
  baseXp?: number;
  /** Local "YYYY-MM-DD"; only for one-off tasks (a habit's days come from its rule). */
  dueDate?: string;
  /** Local "HH:MM", or null to make it "any time". */
  dueTime?: string | null;
  nonNegotiable?: boolean;
  recurrence?: string;
  weights?: PillarWeight[];
}

export type UpdateResult =
  | { result: "updated"; rows: number }
  | { result: "cancelled" | "stopped"; rows: number }
  | { result: "not_found" | "already_done" };

/**
 * Edits a task. For a recurring habit the change applies to this day and every
 * later pending day — new days copy the latest row, so this also changes the
 * habit going forward. Done tasks can't be edited: their XP is in the ledger.
 */
export async function updateTask(
  db: Db,
  taskId: string,
  changes: TaskChanges,
  action: "edit" | "cancel" | "stop",
  config = DEFAULT_CONFIG,
): Promise<UpdateResult> {
  const { data: task, error } = await db
    .from("tasks")
    .select("id, status, series_id, occurs_on, due_at, recurrence")
    .eq("id", taskId)
    .maybeSingle();
  if (error) fail("loading the task", error);
  if (!task) return { result: "not_found" };
  if (task.status === "done") return { result: "already_done" };

  if (action === "cancel") {
    const { error: e } = await db.from("tasks").update({ status: "cancelled" }).eq("id", task.id).neq("status", "done");
    if (e) fail("cancelling the task", e);
    return { result: "cancelled", rows: 1 };
  }

  if (action === "stop") {
    if (!task.series_id) return updateTask(db, taskId, changes, "cancel", config);
    // Cancel what's still open, then dissolve the series so nothing new spawns.
    // Past rows stay as history (as one-offs).
    const { data: open, error: e1 } = await db
      .from("tasks").update({ status: "cancelled" }).eq("series_id", task.series_id).eq("status", "pending").select("id");
    if (e1) fail("stopping the habit", e1);
    const { error: e2 } = await db
      .from("tasks").update({ recurrence: null, series_id: null, occurs_on: null }).eq("series_id", task.series_id);
    if (e2) fail("stopping the habit", e2);
    return { result: "stopped", rows: open.length };
  }

  if (changes.weights) validateWeights(changes.weights);
  if (changes.recurrence) {
    parseRecurrence(changes.recurrence);
    if (!task.series_id) throw new Error("this is a one-off task; add a new recurring task instead");
  }
  if (changes.dueDate && task.series_id) throw new Error("a habit's days come from its recurrence; change that instead");

  // This row, plus later pending rows of the same habit.
  let targets: { id: string; occurs_on: string | null; due_at: string | null }[] = [task];
  if (task.series_id && task.occurs_on) {
    const { data: later, error: e } = await db
      .from("tasks")
      .select("id, occurs_on, due_at")
      .eq("series_id", task.series_id)
      .eq("status", "pending")
      .gt("occurs_on", task.occurs_on);
    if (e) fail("loading the habit", e);
    targets = [task, ...later];
  }

  for (const row of targets) {
    const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.baseXp !== undefined) patch.base_xp = changes.baseXp;
    if (changes.nonNegotiable !== undefined) patch.is_non_negotiable = changes.nonNegotiable;
    if (changes.recurrence !== undefined) patch.recurrence = changes.recurrence;
    if (changes.dueDate !== undefined || changes.dueTime !== undefined) {
      const day = changes.dueDate ?? row.occurs_on ?? (row.due_at ? dayKey(new Date(row.due_at), config.timeZone) : dayKey(new Date(), config.timeZone));
      const time = changes.dueTime === undefined ? (row.due_at ? localTimeOf(new Date(row.due_at), config.timeZone) : null) : changes.dueTime;
      patch.due_at = time ? zonedInstant(day, time, config.timeZone).toISOString() : row.occurs_on ? null : zonedInstant(day, "23:59", config.timeZone).toISOString();
    }
    if (Object.keys(patch).length > 0) {
      const { error: e } = await db.from("tasks").update(patch).eq("id", row.id);
      if (e) fail("updating the task", e);
    }
    if (changes.weights) {
      const { error: e } = await db.rpc("set_task_weights", { p_task_id: row.id, p_weights: changes.weights as unknown as Json });
      if (e) fail("updating pillar weights", e);
    }
  }
  return { result: "updated", rows: targets.length };
}
