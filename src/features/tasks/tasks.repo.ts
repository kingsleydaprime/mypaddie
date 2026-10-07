import { validateWeights, type PillarWeight } from "@/features/xp/split";
import { requireRoom } from "@/features/plans/guard";
import { completionXp, ignoredNeedDeduction, isLate, lateAfter, type SlipForXp, type TaskForXp } from "@/features/xp/xp";
import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Tier } from "@/shared/domain";
import type { Database, Json } from "@/shared/supabase/database.types";
import { eventBlocksOn } from "@/features/events/events.repo";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import {
  checkCapacity,
  DEFAULT_CAPACITY,
  DEFAULT_DURATION,
  findClashes,
  roomOn,
  type CapacitySetting,
  type Clash,
  type DayRoom,
  type DayTask,
} from "./capacity";
import { occursOn, parseRecurrence, planOccurrences, projectedOccurrences, type SeriesForSpawn, type SeriesTemplate } from "./recurrence";

/** How far back catch-up looks for ignored needs and recurring templates. */
const LOOKBACK_DAYS = 14;
const SERIES_LOOKBACK_DAYS = 60;

const TASK_COLUMNS =
  "id, title, status, base_xp, due_at, done_at, is_non_negotiable, must_from, duration_minutes, skill_id, fun_activity_id, topic, item_id, routine_id, routine_step, routines(title), items(tier), task_pillars(pillar, weight)";

type TaskRow = {
  id: string;
  title: string;
  status: TaskForXp["status"];
  base_xp: number;
  due_at: string | null;
  done_at: string | null;
  is_non_negotiable: boolean;
  must_from: string | null;
  duration_minutes: number | null;
  skill_id: string | null;
  fun_activity_id: string | null;
  topic: string | null;
  item_id: string | null;
  routine_id: string | null;
  routine_step: number | null;
  routines: { title: string } | null;
  items: { tier: Tier } | null;
  task_pillars: PillarWeight[];
};

export interface LoadedTask extends TaskForXp {
  title: string;
  isNonNegotiable: boolean;
  itemId: string | null;
  routine: { id: string; title: string; step: number } | null;
}

/** `now` turns a task whose must_from has passed into a non-negotiable. */
function toTask(row: TaskRow, now?: Date): LoadedTask {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    tier: row.items?.tier ?? null,
    baseXp: row.base_xp,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    weights: row.task_pillars,
    isNonNegotiable:
      row.is_non_negotiable || (now !== undefined && row.must_from !== null && Date.parse(row.must_from) <= now.getTime()),
    itemId: row.item_id,
    routine: row.routine_id && row.routines ? { id: row.routine_id, title: row.routines.title, step: row.routine_step ?? 0 } : null,
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
export async function loadTasksAroundToday(db: Db, now: Date, config = currentConfig()): Promise<LoadedTask[]> {
  const today = dayKey(now, config.timeZone);
  const from = zonedInstant(addDays(today, -1), "00:00", config.timeZone).toISOString();
  const to = zonedInstant(addDays(today, 1), "00:00", config.timeZone).toISOString();
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .or(`and(due_at.gte.${from},due_at.lt.${to}),and(due_at.is.null,status.in.(pending,skipped))`)
    .returns<TaskRow[]>();
  if (error) fail("loading today's tasks", error);
  return data.map((r) => toTask(r, now));
}

/** Needs that were due before today and are still open — candidates for "ignored". */
export async function loadOpenPastNeeds(
  db: Db,
  now: Date,
  config = currentConfig(),
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

  const tasks = data.map((r) => toTask(r));
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
export async function catchUp(db: Db, now: Date, config = currentConfig()): Promise<CatchUpResult> {
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
  | { result: "completed"; xp: number; late: boolean; title: string; practiceLogged?: { minutes: number; topic: string | null }; funLogged?: boolean }
  | { result: "already_done" | "cancelled" | "not_found"; title: string | null };

/**
 * Marks a task done and pays its weighted XP, atomically and at most once.
 * `confidence` (1–5) rates a study task's topic afterwards; it sets when the
 * topic comes back for review.
 */
export async function completeTask(db: Db, taskId: string, now: Date, config = currentConfig(), opts: { confidence?: number | null } = {}): Promise<CompleteResult> {
  const { data, error } = await db.from("tasks").select(TASK_COLUMNS).eq("id", taskId).returns<TaskRow[]>().maybeSingle();
  if (error) fail("loading the task", error);
  if (!data) return { result: "not_found", title: null };

  const task = toTask(data);
  if (task.status === "done") return { result: "already_done", title: task.title };
  if (task.status === "cancelled") return { result: "cancelled", title: task.title };

  // A time block (workout, meeting) is on time all day; a deadline isn't.
  const timed = { ...task, dueAt: lateAfter(task.dueAt, data.duration_minutes, config) };
  const entries = completionXp(timed, now, config);
  const { data: outcome, error: rpcError } = await db.rpc("complete_task", {
    p_task_id: taskId,
    p_done_at: now.toISOString(),
    p_entries: entries as unknown as Json,
  });
  if (rpcError) fail("completing the task", rpcError);

  const result = (outcome as { result: string }).result;
  if (result !== "completed") return { result: result as "already_done", title: task.title };

  // A task that was an application requirement ticks it off.
  await db.from("application_requirements").update({ done: true }).eq("task_id", taskId);
  // A promise's task: the promise is kept (kept late still records when — see promises.ts).
  await db.from("promises").update({ status: "kept", kept_at: now.toISOString() }).eq("task_id", taskId).eq("status", "open");
  await db.from("promises").update({ kept_at: now.toISOString() }).eq("task_id", taskId).eq("status", "broken").is("kept_at", null);

  // Practice for a skill: record the time. No XP here — the task just paid it.
  let practiceLogged: { minutes: number; topic: string | null } | undefined;
  if (data.skill_id) {
    const minutes = data.duration_minutes ?? DEFAULT_DURATION;
    const { error: practiceError } = await db.rpc("record_learning", {
      p_skill_id: data.skill_id,
      p_topic: data.topic as string,
      p_minutes: minutes,
      p_count: null as unknown as number,
      p_unit: null as unknown as string,
      p_confidence: (opts.confidence ?? null) as number,
      p_notes: `From task: ${task.title}`,
      p_at: now.toISOString(),
      p_xp: [] as unknown as Json,
    });
    if (!practiceError) practiceLogged = { minutes, topic: data.topic };
  }

  // A fun activity: it happened. Feeds "days since fun" and the variety in suggestions.
  let funLogged = false;
  if (data.fun_activity_id) {
    const { data: fun } = await db.from("fun_activities").select("times_done").eq("id", data.fun_activity_id).maybeSingle();
    if (fun) {
      await db.from("fun_activities").update({ times_done: fun.times_done + 1, last_done_at: now.toISOString() }).eq("id", data.fun_activity_id);
      funLogged = true;
    }
  }
  return {
    ...(practiceLogged ? { practiceLogged } : {}),
    ...(funLogged ? { funLogged } : {}),
    result: "completed",
    xp: entries.reduce((sum, e) => sum + e.amount, 0),
    late: isLate(timed, now),
    title: task.title,
  };
}

// ─── Capacity and time blocks ───────────────────────────────────────────────

const CAPACITY_KEY = "capacity";
/** How far ahead a new habit is checked for clashes and capacity. */
const HABIT_CHECK_DAYS = 14;

export async function loadCapacity(db: Db): Promise<CapacitySetting> {
  const { data, error } = await db.from("settings").select("value").eq("key", CAPACITY_KEY).maybeSingle();
  if (error) fail("loading capacity", error);
  const v = data?.value as Partial<CapacitySetting> | undefined;
  if (!v || typeof v.defaultMinutes !== "number" || !Array.isArray(v.periods)) return DEFAULT_CAPACITY;
  return { defaultMinutes: v.defaultMinutes, periods: v.periods };
}

export async function saveCapacity(db: Db, setting: CapacitySetting) {
  const { error } = await db
    .from("settings")
    .upsert({ key: CAPACITY_KEY, value: setting as unknown as { [key: string]: Json } }, { onConflict: "user_id,key" });
  if (error) fail("saving capacity", error);
}

/** Tasks and timed events on one local day, for capacity and clash checks. */
export async function loadDayTasks(db: Db, day: string, config = currentConfig()): Promise<DayTask[]> {
  const from = zonedInstant(day, "00:00", config.timeZone).toISOString();
  const to = zonedInstant(addDays(day, 1), "00:00", config.timeZone).toISOString();
  const { data, error } = await db
    .from("tasks")
    .select("id, title, due_at, duration_minutes, status")
    // Timed tasks on the day, plus "any time" habit rows for it.
    .or(`and(due_at.gte.${from},due_at.lt.${to}),and(occurs_on.eq.${day},due_at.is.null)`);
  if (error) fail("loading the day", error);
  const tasks: DayTask[] = data.map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.due_at ? new Date(t.due_at) : null,
    durationMinutes: t.duration_minutes,
    status: t.status,
  }));
  // Timed events take time too: a task can clash with a meeting, and a
  // three-hour wedding uses three hours of that day's capacity. Habit days not
  // created yet (rows are made each morning) are projected, or a future day
  // full of habits would look empty.
  const [events, templates] = await Promise.all([eventBlocksOn(db, day), loadSeriesTemplates(db)]);
  return [...tasks, ...events, ...projectedOccurrences(templates, day, config)];
}

/** The latest row of every recurring habit — its template for future days. */
export async function loadSeriesTemplates(db: Db): Promise<SeriesTemplate[]> {
  const { data, error } = await db
    .from("tasks")
    .select("series_id, title, recurrence, occurs_on, due_at, duration_minutes")
    .not("series_id", "is", null)
    .order("occurs_on", { ascending: false });
  if (error) fail("loading habits", error);
  const latest = new Map<string, SeriesTemplate>();
  for (const r of data) {
    if (!r.series_id || !r.recurrence || !r.occurs_on || latest.has(r.series_id)) continue;
    latest.set(r.series_id, {
      seriesId: r.series_id,
      title: r.title,
      rule: r.recurrence,
      lastOccursOn: r.occurs_on,
      lastDueAt: r.due_at ? new Date(r.due_at) : null,
      durationMinutes: r.duration_minutes,
    });
  }
  return [...latest.values()];
}

/** Why a task can't go where it was asked to. */
export type Refusal =
  | { result: "clash"; clashes: Clash[] }
  | { result: "over_capacity"; room: DayRoom; adding: number };

/**
 * The two checks before anything lands on a day:
 *   clash    — overlaps another block; skipped when `forceClash` (a deliberate double-booking)
 *   capacity — the day is full; no override (change capacity instead)
 */
async function guardDay(
  db: Db,
  opts: { day: string; start: Date | null; minutes: number; excludeId: string | null; forceClash: boolean; now: Date },
  config: EngineConfig,
): Promise<Refusal | null> {
  const tasks = (await loadDayTasks(db, opts.day, config)).filter((t) => t.id !== opts.excludeId);
  if (opts.start && !opts.forceClash) {
    const clashes = findClashes(opts.start, opts.minutes, tasks);
    if (clashes.length > 0) return { result: "clash", clashes };
  }
  const dayEnd = dayEndsAt(await loadSchedule(db));
  const check = checkCapacity(roomOn(opts.day, tasks, await loadCapacity(db), opts.now, config, dayEnd), opts.minutes);
  return check.ok ? null : { result: "over_capacity", room: check.room, adding: check.adding };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface NewTask {
  title: string;
  itemId: string | null;
  baseXp: number;
  /** Local date "YYYY-MM-DD"; defaults to today when a time or recurrence is given. */
  dueDate: string | null;
  /** Local time "HH:MM"; null = any time that day. */
  dueTime: string | null;
  /** RRULE subset; null = one-off. */
  recurrence: string | null;
  nonNegotiable: boolean;
  weights: PillarWeight[];
  durationMinutes?: number | null;
  /** Which reminders; null/undefined = the default for its kind. */
  reminders?: Reminder[] | null;
  /** When it turns into a must-do. */
  mustFrom?: Date | null;
  /** Book it even if it overlaps something (never bypasses capacity). */
  forceClash?: boolean;
  /** Completing it logs practice time for this skill. */
  skillId?: string | null;
  /** His own words for this task's notifications. */
  reminderNote?: string | null;
  /** Doing it counts as doing this fun activity. */
  funActivityId?: string | null;
  /** The topic a study task covers (recorded with the practice time). */
  topic?: string | null;
  /** The job, role, team or group it's for. */
  commitmentId?: string | null;
  /** A class in a course's timetable. */
  courseId?: string | null;
  /** A step in a routine (the routine counts once toward the habit limit). */
  routine?: { id: string; step: number } | null;
  location?: string | null;
  /**
   * Set by others, not chosen: a class, a shift. Never refused for a full day
   * or a clash (you have to be there); the caller reports the load instead.
   */
  fixed?: boolean;
}

export type Reminder = "eve" | "morning" | "30" | "10";

export type CreateResult = { result: "created"; task: { id: string; title: string; due_at: string | null; recurrence: string | null } } | Refusal;

/**
 * Creates a task and its pillar weights, after the clash and capacity checks.
 * Weights and recurrence are validated before anything is written; if the
 * weights insert still fails, the task row is removed again so there's never
 * a task that can't pay XP. A habit is checked against its first day only.
 */
export async function createTask(db: Db, task: NewTask, now: Date, config = currentConfig()): Promise<CreateResult> {
  validateWeights(task.weights);
  if (task.recurrence) {
    parseRecurrence(task.recurrence);
    // Classes come with a course, not a choice: they don't use up habit slots.
    if (!task.courseId && !task.routine) await requireRoom(db, "habits");
  }

  const hasDay = task.dueDate !== null || task.dueTime !== null || task.recurrence !== null;
  const day = task.dueDate ?? dayKey(now, config.timeZone);
  const start = task.dueTime ? zonedInstant(day, task.dueTime, config.timeZone) : null;
  const dueAt = start ?? (task.dueDate ? zonedInstant(day, "23:59", config.timeZone) : null);

  if (hasDay && !task.fixed) {
    // A one-off is checked on its day; a habit on each of its next 14 days,
    // so a daily habit can't quietly overfill next Tuesday.
    const rule = task.recurrence ? parseRecurrence(task.recurrence) : null;
    const days = rule ? Array.from({ length: HABIT_CHECK_DAYS }, (_, i) => addDays(day, i)).filter((d) => d === day || occursOn(rule, d)) : [day];
    for (const d of days) {
      const refusal = await guardDay(
        db,
        {
          day: d,
          start: task.dueTime ? zonedInstant(d, task.dueTime, config.timeZone) : null,
          minutes: task.durationMinutes ?? DEFAULT_DURATION,
          excludeId: null,
          forceClash: task.forceClash ?? false,
          now,
        },
        config,
      );
      if (refusal) return refusal;
    }
  }

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
      duration_minutes: task.durationMinutes ?? null,
      reminders: task.reminders ?? null,
      must_from: task.mustFrom?.toISOString() ?? null,
      skill_id: task.skillId ?? null,
      reminder_note: task.reminderNote?.trim() || null,
      fun_activity_id: task.funActivityId ?? null,
      topic: task.topic?.trim() || null,
      commitment_id: task.commitmentId ?? null,
      course_id: task.courseId ?? null,
      routine_id: task.routine?.id ?? null,
      routine_step: task.routine?.step ?? null,
      location: task.location?.trim() || null,
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
  return { result: "created", task: data };
}

// ─── Update ──────────────────────────────────────────────────────────────────

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
  durationMinutes?: number | null;
  reminders?: Reminder[] | null;
  mustFrom?: Date | null;
  forceClash?: boolean;
  skillId?: string | null;
  reminderNote?: string | null;
  commitmentId?: string | null;
}

export type UpdateResult =
  | { result: "updated"; rows: number }
  | { result: "cancelled" | "stopped"; rows: number }
  | { result: "not_found" | "already_done" }
  | Refusal;

/**
 * Edits a task. For a recurring habit the change applies to this day and every
 * later pending day — new days copy the latest row, so this also changes the
 * habit going forward. Done tasks can't be edited: their XP is in the ledger.
 * Moving or lengthening a task re-runs the clash and capacity checks.
 */
export async function updateTask(
  db: Db,
  taskId: string,
  changes: TaskChanges,
  action: "edit" | "cancel" | "stop",
  now: Date = new Date(),
  config = currentConfig(),
): Promise<UpdateResult> {
  const { data: task, error } = await db
    .from("tasks")
    .select("id, status, series_id, occurs_on, due_at, recurrence, duration_minutes")
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
    if (!task.series_id) return updateTask(db, taskId, changes, "cancel", now, config);
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

  const newDueAt = (row: { occurs_on: string | null; due_at: string | null }): string | null => {
    const day = changes.dueDate ?? row.occurs_on ?? (row.due_at ? dayKey(new Date(row.due_at), config.timeZone) : dayKey(now, config.timeZone));
    const time = changes.dueTime === undefined ? (row.due_at ? localTimeOf(new Date(row.due_at), config.timeZone) : null) : changes.dueTime;
    return time ? zonedInstant(day, time, config.timeZone).toISOString() : row.occurs_on ? null : zonedInstant(day, "23:59", config.timeZone).toISOString();
  };
  const moves = changes.dueDate !== undefined || changes.dueTime !== undefined;

  // Re-check the day this task lands on, if its time or length changes.
  if (moves || changes.durationMinutes !== undefined) {
    const dueAt = moves ? newDueAt(task) : task.due_at;
    if (dueAt) {
      const at = new Date(dueAt);
      // 23:59 is how "any time that day" is stored: it counts for capacity but isn't a block.
      const timed = localTimeOf(at, config.timeZone) !== "23:59";
      const refusal = await guardDay(
        db,
        {
          day: dayKey(at, config.timeZone),
          start: timed ? at : null,
          minutes: (changes.durationMinutes !== undefined ? changes.durationMinutes : task.duration_minutes) ?? DEFAULT_DURATION,
          excludeId: task.id,
          forceClash: changes.forceClash ?? false,
          now,
        },
        config,
      );
      if (refusal) return refusal;
    }
  }

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
    if (changes.durationMinutes !== undefined) patch.duration_minutes = changes.durationMinutes;
    if (changes.reminders !== undefined) patch.reminders = changes.reminders;
    if (changes.mustFrom !== undefined) patch.must_from = changes.mustFrom?.toISOString() ?? null;
    if (changes.skillId !== undefined) patch.skill_id = changes.skillId;
    if (changes.reminderNote !== undefined) patch.reminder_note = changes.reminderNote?.trim() || null;
    if (changes.commitmentId !== undefined) patch.commitment_id = changes.commitmentId;
    if (moves) patch.due_at = newDueAt(row);
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

// ─── Delete ──────────────────────────────────────────────────────────────────

export type DeleteResult = { result: "deleted" | "not_found" } | { result: "has_history"; xpEntries: number; slips: number };

/**
 * For mistakes only: a task that never earned or lost XP and has no slips.
 * Anything with history is part of the record — cancel or stop it instead.
 */
export async function deleteTask(db: Db, taskId: string): Promise<DeleteResult> {
  const [task, xp, slips] = await Promise.all([
    db.from("tasks").select("id").eq("id", taskId).maybeSingle(),
    db.from("xp_log").select("id", { count: "exact", head: true }).eq("task_id", taskId),
    db.from("slips").select("id", { count: "exact", head: true }).eq("task_id", taskId),
  ]);
  for (const r of [task, xp, slips]) if (r.error) fail("checking the task", r.error);
  if (!task.data) return { result: "not_found" };
  if ((xp.count ?? 0) > 0 || (slips.count ?? 0) > 0) {
    return { result: "has_history", xpEntries: xp.count ?? 0, slips: slips.count ?? 0 };
  }
  const { error } = await db.from("tasks").delete().eq("id", taskId);
  if (error) fail("deleting the task", error);
  return { result: "deleted" };
}
