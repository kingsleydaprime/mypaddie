import { requireRoom } from "@/features/plans/guard";
import { createTask, updateTask } from "@/features/tasks/tasks.repo";
import type { PillarWeight } from "@/features/xp/split";
import { firstOccurrence, parseRecurrence } from "@/features/tasks/recurrence";
import type { Db } from "@/shared/supabase/token-client";
import { currentConfig } from "@/shared/config";
import { dayKey, localTimeOf } from "@/shared/time";
import { planRoutineEdit, stepTimes, type NewStep } from "./routines";

export interface StepInput {
  title: string;
  minutes?: number;
  weights?: PillarWeight[];
}

const DEFAULT_WEIGHTS: PillarWeight[] = [{ pillar: "character", weight: 50 }, { pillar: "physical", weight: 50 }];

const addMinutes = (hhmm: string, m: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + m;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * A routine: several habits that belong together (morning, night, before
 * study), each its own task so XP and reminders still work step by step, shown
 * on Today as one item. With a start time, steps follow one another; without,
 * they're any time that day. The routine counts as one habit for plan limits.
 */
export async function createRoutine(
  db: Db,
  input: { title: string; steps: StepInput[]; recurrence: string; time?: string | null; nonNegotiable?: boolean; startDate?: string | null },
  now: Date,
) {
  const rule = parseRecurrence(input.recurrence);
  await requireRoom(db, "habits");
  // Every step starts on the same day, judged by the routine's start time — so
  // set up at 06:10, a 06:00 routine starts tomorrow as a whole, not half today.
  const today = dayKey(now, currentConfig().timeZone);
  const firstDay = firstOccurrence(rule, input.startDate ?? today, { today, time: localTimeOf(now, currentConfig().timeZone) }, input.time ?? null);
  if (firstDay === null) throw new Error("this routine's rule ends before it ever happens — check the UNTIL date");
  const routine = await newRoutineRow(db, input.title.trim());
  if (!routine) return { result: "exists" as const, title: input.title.trim() };
  const made: string[] = [];
  let at = input.time ?? null;
  for (const [i, s] of input.steps.entries()) {
    const minutes = s.minutes ?? 10;
    const result = await createTask(
      db,
      {
        title: s.title.trim(),
        itemId: null,
        baseXp: 5,
        // Timed: the shared first day. Untimed steps can always start today (or the given date).
        dueDate: input.time ? firstDay : input.startDate ?? null,
        dueTime: at,
        recurrence: input.recurrence,
        nonNegotiable: input.nonNegotiable ?? true,
        weights: s.weights ?? DEFAULT_WEIGHTS,
        durationMinutes: minutes,
        routine: { id: routine.id, step: i + 1 },
        // Steps sit back to back; they never clash with each other.
        forceClash: true,
      },
      now,
    );
    if (result.result !== "created") {
      // All or nothing: a routine saved with some (or none) of its steps looks
      // made but never shows up. Undo it and say which step didn't fit, and why.
      await discardRoutine(db, routine.id);
      const { result: reason, ...detail } = result;
      return { result: "refused" as const, step: s.title, reason, ...detail, saved: false };
    }
    made.push(result.task.title);
    if (at) at = addMinutes(at, minutes);
  }
  return { result: "created" as const, id: routine.id, steps: made };
}

/**
 * The routine's row, or null if one by that name already has steps. A
 * same-named routine with no steps (left behind before creation was all or
 * nothing) is taken over rather than blocking the name forever.
 */
async function newRoutineRow(db: Db, title: string): Promise<{ id: string } | null> {
  const { data, error } = await db.from("routines").insert({ title }).select("id").single();
  if (!error) return data;
  if (error.code !== "23505") throw new Error(`creating the routine: ${error.message}`);
  const { data: existing, error: e1 } = await db.from("routines").select("id").ilike("title", title.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  // The name is unique ignoring case (routines_title_per_user), so match it the same way; % and _ are literal.
  if (e1) throw new Error(`finding the routine: ${e1.message}`);
  if (!existing) return null;
  const { count, error: e2 } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("routine_id", existing.id).not("series_id", "is", null);
  if (e2) throw new Error(`checking the routine's steps: ${e2.message}`);
  return count === 0 ? existing : null;
}

/** Remove a routine that was never finished being made: its step rows first (the link would only be nulled), then the routine. */
async function discardRoutine(db: Db, id: string) {
  const { error: e1 } = await db.from("tasks").delete().eq("routine_id", id);
  if (e1) throw new Error(`undoing the routine's steps: ${e1.message}`);
  const { error: e2 } = await db.from("routines").delete().eq("id", id);
  if (e2) throw new Error(`undoing the routine: ${e2.message}`);
}

export async function loadRoutines(db: Db) {
  const [{ data: routines }, { data: steps }] = await Promise.all([
    db.from("routines").select("id, title").order("created_at"),
    db.from("tasks").select("routine_id, routine_step, title, series_id, recurrence, occurs_on").not("routine_id", "is", null).not("recurrence", "is", null).order("occurs_on", { ascending: false }),
  ]);
  return (routines ?? []).map((r) => {
    const seen = new Set<string>();
    const mine = (steps ?? []).filter((s) => s.routine_id === r.id && s.series_id && !seen.has(s.series_id) && seen.add(s.series_id));
    return { id: r.id, title: r.title, recurrence: mine[0]?.recurrence ?? null, steps: mine.sort((a, b) => (a.routine_step ?? 0) - (b.routine_step ?? 0)).map((s) => s.title) };
  });
}

/** Stop a routine: every step's habit stops (history stays), and the routine goes. */
export async function stopRoutine(db: Db, ref: string, now: Date) {
  const routines = await loadRoutines(db);
  const r = routines.find((x) => x.id === ref || x.title.toLowerCase() === ref.trim().toLowerCase());
  if (!r) return { result: "not_found" as const };
  const { data: open } = await db.from("tasks").select("id, series_id").eq("routine_id", r.id).eq("status", "pending");
  const seen = new Set<string>();
  for (const t of open ?? []) {
    if (t.series_id && seen.has(t.series_id)) continue;
    if (t.series_id) seen.add(t.series_id);
    await updateTask(db, t.id, {}, t.series_id ? "stop" : "cancel", now);
  }
  await db.from("routines").delete().eq("id", r.id);
  return { result: "stopped" as const, title: r.title };
}

interface LiveStep {
  seriesId: string;
  /** The next open day of this step's habit; editing it carries forward. Null if none is open. */
  nextId: string | null;
  title: string;
  minutes: number;
  dueAt: string | null;
  recurrence: string | null;
  nonNegotiable: boolean;
  step: number;
}

async function loadSteps(db: Db, routineId: string, now: Date): Promise<LiveStep[]> {
  const today = dayKey(now, currentConfig().timeZone);
  const { data, error } = await db
    .from("tasks")
    .select("id, series_id, title, duration_minutes, due_at, recurrence, is_non_negotiable, routine_step, status, occurs_on")
    .eq("routine_id", routineId)
    .not("series_id", "is", null)
    .order("occurs_on", { ascending: true });
  if (error) throw new Error(`loading the routine's steps: ${error.message}`);
  const bySeries = new Map<string, LiveStep>();
  for (const t of data) {
    const open = t.status === "pending" && (t.occurs_on ?? "") >= today;
    // Rows come oldest first: keep the latest details until the first open day, then stop there.
    if (bySeries.get(t.series_id!)?.nextId) continue;
    bySeries.set(t.series_id!, {
      seriesId: t.series_id!,
      nextId: open ? t.id : null,
      title: t.title,
      minutes: t.duration_minutes ?? 10,
      dueAt: t.due_at,
      recurrence: t.recurrence,
      nonNegotiable: t.is_non_negotiable,
      step: t.routine_step ?? 0,
    });
  }
  return [...bySeries.values()].sort((a, b) => a.step - b.step);
}

/** The routine's start time today, or null when its steps are "any time that day". */
function startTime(steps: LiveStep[]): string | null {
  const first = steps[0]?.dueAt;
  if (!first) return null;
  const t = localTimeOf(new Date(first), currentConfig().timeZone);
  return t === "23:59" ? null : t;
}

/**
 * Edit a routine in place: rename, drop steps, add steps, reorder, move the
 * start time. Steps stay their own habits (history and streaks intact); only
 * their order and times change. Removing a step stops its habit.
 */
export async function updateRoutine(
  db: Db,
  ref: string,
  edit: { title?: string; remove?: string[]; add?: (NewStep & { weights?: PillarWeight[] })[]; order?: string[]; time?: string | null },
  now: Date,
) {
  const r = (await loadRoutines(db)).find((x) => x.id === ref || x.title.toLowerCase() === ref.trim().toLowerCase());
  if (!r) return { result: "not_found" as const };
  const steps = await loadSteps(db, r.id, now);
  const plan = planRoutineEdit(steps, edit);
  if (!plan.ok) return { result: "refused" as const, ...plan };

  if (edit.title && edit.title.trim() !== r.title) {
    const { error } = await db.from("routines").update({ title: edit.title.trim() }).eq("id", r.id);
    if (error?.code === "23505") return { result: "title_taken" as const, title: edit.title.trim() };
    if (error) throw new Error(`renaming the routine: ${error.message}`);
  }

  for (const title of plan.removed) {
    const s = steps.find((x) => x.title === title)!;
    if (s.nextId) await updateTask(db, s.nextId, {}, "stop", now);
    else await db.from("tasks").update({ recurrence: null, series_id: null, occurs_on: null }).eq("series_id", s.seriesId);
  }

  const structural = plan.removed.length > 0 || (edit.add?.length ?? 0) > 0 || edit.order !== undefined;
  const start = edit.time !== undefined ? edit.time : startTime(steps);
  const retime = edit.time !== undefined || (structural && start !== null);
  const times = stepTimes(start, plan.steps.map((s) => s.minutes));
  const template = steps[0]!;
  const notes: string[] = [];
  const refused: ({ step: string } & Record<string, unknown>)[] = [];

  for (const [i, p] of plan.steps.entries()) {
    if (p.kind === "add") {
      const extra = edit.add!.find((a) => a.title.trim().toLowerCase() === p.title.toLowerCase());
      const added = await createTask(
        db,
        {
          title: p.title,
          itemId: null,
          baseXp: 5,
          dueDate: null,
          dueTime: times[i] ?? null,
          recurrence: template.recurrence ?? "FREQ=DAILY",
          nonNegotiable: template.nonNegotiable,
          weights: extra?.weights ?? DEFAULT_WEIGHTS,
          durationMinutes: p.minutes,
          routine: { id: r.id, step: i + 1 },
          forceClash: true,
        },
        now,
      );
      if (added.result !== "created") {
        const { result: reason, ...detail } = added;
        refused.push({ step: p.title, reason, ...detail });
      }
      continue;
    }
    const s = steps.find((x) => x.title === p.title)!;
    if (s.step !== i + 1) {
      const { error } = await db.from("tasks").update({ routine_step: i + 1 }).eq("series_id", s.seriesId);
      if (error) throw new Error(`reordering the routine: ${error.message}`);
    }
    if (retime) {
      if (s.nextId) await updateTask(db, s.nextId, { dueTime: times[i] ?? null, forceClash: true }, "edit", now);
      else notes.push(`${s.title}: no open day to move; it keeps its time until the next one appears`);
    }
  }

  return {
    result: "updated" as const,
    title: edit.title?.trim() || r.title,
    steps: plan.steps
      .map((s, i) => ({ title: s.title, at: times[i] ?? "any time", minutes: s.minutes, new: s.kind === "add" }))
      .filter((s) => !refused.some((x) => x.step === s.title)),
    removed: plan.removed,
    // Steps asked for but not added (the day was full, usually): nothing was saved for these.
    ...(refused.length > 0 ? { notAdded: refused } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}
