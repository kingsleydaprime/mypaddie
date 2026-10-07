import { requireRoom } from "@/features/plans/guard";
import { createTask, updateTask, type CreateResult } from "@/features/tasks/tasks.repo";
import type { PillarWeight } from "@/features/xp/split";
import { parseRecurrence } from "@/features/tasks/recurrence";
import type { Db } from "@/shared/supabase/token-client";

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
  parseRecurrence(input.recurrence);
  await requireRoom(db, "habits");
  const { data: routine, error } = await db.from("routines").insert({ title: input.title.trim() }).select("id").single();
  if (error?.code === "23505") return { result: "exists" as const, title: input.title.trim() };
  if (error) throw new Error(`creating the routine: ${error.message}`);
  const results: { step: string; result: CreateResult["result"] }[] = [];
  let at = input.time ?? null;
  for (const [i, s] of input.steps.entries()) {
    const minutes = s.minutes ?? 10;
    const made = await createTask(
      db,
      {
        title: s.title.trim(),
        itemId: null,
        baseXp: 5,
        dueDate: input.startDate ?? null,
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
    results.push({ step: s.title, result: made.result });
    if (at) at = addMinutes(at, minutes);
  }
  return { result: "created" as const, id: routine.id, steps: results };
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
