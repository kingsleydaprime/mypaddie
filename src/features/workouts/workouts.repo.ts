import { completeTask, createTask, updateTask, type CompleteResult, type Refusal } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey } from "@/shared/time";
import {
  firstTrainingDay,
  lastPerformance,
  newBests,
  parseWeekdays,
  summarizeTraining,
  weekdayCode,
  WORKOUT_WEIGHTS,
  workoutBaseXp,
  type HistoryEntry,
  type NewBest,
  type PerformedEntry,
  type WeekdayCode,
} from "./training";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

export interface PlanExerciseInput {
  name: string;
  sets?: number;
  reps?: string;
  weightKg?: number;
  seconds?: number;
  notes?: string;
}

export interface PlanDayInput {
  name: string;
  weekdays: WeekdayCode[];
  startTime?: string | null;
  durationMinutes?: number;
  exercises: PlanExerciseInput[];
}

type DayRow = {
  id: string;
  name: string;
  weekdays: string;
  start_time: string | null;
  duration_minutes: number;
  series_id: string | null;
  workout_exercises: { name: string; sets: number | null; reps: string | null; weight_kg: number | null; seconds: number | null; notes: string | null; position: number }[];
};

export async function loadActivePlan(db: Db) {
  const { data, error } = await db
    .from("workout_plans")
    .select("id, name, workout_days(id, name, weekdays, start_time, duration_minutes, series_id, position, workout_exercises(name, sets, reps, weight_kg, seconds, notes, position))")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`loading the plan: ${error.message}`);
  if (!data) return null;
  const days = ((data.workout_days ?? []) as (DayRow & { position: number })[])
    .sort((a, b) => a.position - b.position)
    .map((d) => ({ ...d, workout_exercises: [...d.workout_exercises].sort((a, b) => a.position - b.position) }));
  return { id: data.id, name: data.name, days };
}

/** All past entries with when they happened — the basis for "last time" and bests. */
async function loadHistory(db: Db): Promise<HistoryEntry[]> {
  const { data, error } = await db.from("workout_entries").select("exercise, sets, reps, weight_kg, seconds, workout_logs(at)");
  if (error) throw new Error(`loading workout history: ${error.message}`);
  return data.map((r) => ({
    exercise: r.exercise,
    sets: r.sets,
    reps: r.reps,
    weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
    seconds: r.seconds,
    at: new Date((r.workout_logs as unknown as { at: string }).at),
  }));
}

async function stopSeries(db: Db, seriesId: string, now: Date) {
  const { data } = await db.from("tasks").select("id").eq("series_id", seriesId).limit(1).maybeSingle();
  if (data) await updateTask(db, data.id, {}, "stop", now);
}

export type DaySchedule =
  | { day: string; result: "scheduled"; firstDate: string }
  | ({ day: string } & Refusal);

/**
 * Saves a plan. With `activate`, the previous plan's training tasks are
 * stopped, this plan becomes the active one, and each training day becomes a
 * weekly recurring task — through createTask, so clashes and capacity apply.
 * Days that can't be scheduled are reported, not silently dropped.
 */
export async function savePlan(
  db: Db,
  name: string,
  days: PlanDayInput[],
  opts: { activate: boolean; nonNegotiable: boolean },
  now: Date,
) {
  const { data: planId, error } = await db.rpc("save_workout_plan", {
    p_name: name,
    p_days: days.map((d) => ({
      name: d.name,
      weekdays: d.weekdays.join(","),
      start_time: d.startTime ?? null,
      duration_minutes: d.durationMinutes ?? 60,
      exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets ?? null, reps: e.reps ?? null, weight_kg: e.weightKg ?? null, seconds: e.seconds ?? null, notes: e.notes ?? null })),
    })) as unknown as Json,
  });
  if (error) throw new Error(`saving the plan: ${error.message}`);
  if (!opts.activate) return { planId, activated: false, schedule: [] as DaySchedule[], stoppedOldPlan: false };

  // Retire the old plan first: the one-active index allows only one at a time.
  const old = await loadActivePlan(db);
  if (old) {
    for (const d of old.days) if (d.series_id) await stopSeries(db, d.series_id, now);
    await db.from("workout_plans").update({ is_active: false }).eq("id", old.id);
  }
  const { error: actErr } = await db.from("workout_plans").update({ is_active: true }).eq("id", planId);
  if (actErr) throw new Error(`activating the plan: ${actErr.message}`);

  const plan = (await loadActivePlan(db))!;
  const today = dayKey(now, tz());
  const schedule: DaySchedule[] = [];
  for (const d of plan.days) {
    const weekdays = parseWeekdays(d.weekdays);
    const firstDate = firstTrainingDay(today, weekdays);
    const created = await createTask(
      db,
      {
        title: d.name,
        itemId: null,
        baseXp: workoutBaseXp(d.duration_minutes),
        dueDate: firstDate,
        dueTime: d.start_time ? d.start_time.slice(0, 5) : null,
        recurrence: `FREQ=WEEKLY;BYDAY=${weekdays.join(",")}`,
        nonNegotiable: opts.nonNegotiable,
        weights: WORKOUT_WEIGHTS,
        durationMinutes: d.duration_minutes,
        // Training is looking after yourself: it uses the day, not your work hours.
        selfCare: true,
      },
      now,
    );
    if (created.result !== "created") {
      schedule.push({ day: d.name, ...created });
      continue;
    }
    const { data: t } = await db.from("tasks").select("series_id").eq("id", created.task.id).single();
    await db.from("workout_days").update({ series_id: t!.series_id }).eq("id", d.id);
    schedule.push({ day: d.name, result: "scheduled", firstDate });
  }
  return { planId, activated: true, schedule, stoppedOldPlan: old !== null };
}

/** The workout planned for a date, with what was done last time on each exercise. */
export async function workoutFor(db: Db, now: Date, date?: string) {
  const day = date ?? dayKey(now, tz());
  const plan = await loadActivePlan(db);
  if (!plan) return { date: day, plan: null, workouts: [] };

  const planned = plan.days.filter((d) => parseWeekdays(d.weekdays).includes(weekdayCode(day)));
  const history = planned.length ? await loadHistory(db) : [];
  const workouts = await Promise.all(
    planned.map(async (d) => {
      const { data: task } = d.series_id
        ? await db.from("tasks").select("id, status").eq("series_id", d.series_id).eq("occurs_on", day).maybeSingle()
        : { data: null };
      return {
        dayId: d.id,
        name: d.name,
        startTime: d.start_time?.slice(0, 5) ?? null,
        durationMinutes: d.duration_minutes,
        task,
        exercises: d.workout_exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weightKg: e.weight_kg === null ? null : Number(e.weight_kg),
          seconds: e.seconds,
          notes: e.notes,
          lastTime: lastPerformance(e.name, history),
        })),
      };
    }),
  );
  return { date: day, plan: plan.name, workouts };
}

export interface WorkoutLogInput {
  /** Which training day; default: the one planned today. */
  day?: string;
  durationMinutes: number;
  feel?: number;
  notes?: string;
  entries: PerformedEntry[];
}

/**
 * Records a workout, flags new personal bests, and completes today's training
 * task — which is what pays the XP. An unplanned workout becomes a one-off
 * task completed on the spot, so XP always flows through tasks (and can't be
 * paid twice).
 */
export async function logWorkout(db: Db, input: WorkoutLogInput, now: Date) {
  const today = dayKey(now, tz());
  const plan = await loadActivePlan(db);
  const candidates = plan?.days ?? [];
  const day = input.day
    ? candidates.find((d) => d.name.trim().toLowerCase() === input.day!.trim().toLowerCase()) ?? null
    : (() => {
        const todays = candidates.filter((d) => parseWeekdays(d.weekdays).includes(weekdayCode(today)));
        return todays.length === 1 ? todays[0]! : null;
      })();

  let taskId: string | null = null;
  if (day?.series_id) {
    const { data } = await db.from("tasks").select("id").eq("series_id", day.series_id).eq("occurs_on", today).in("status", ["pending", "skipped"]).maybeSingle();
    taskId = data?.id ?? null;
  }
  if (!taskId) {
    const created = await createTask(
      db,
      {
        title: day ? day.name : input.day ?? "Workout",
        itemId: null,
        baseXp: workoutBaseXp(input.durationMinutes),
        dueDate: null,
        dueTime: null,
        recurrence: null,
        nonNegotiable: false,
        weights: WORKOUT_WEIGHTS,
        durationMinutes: input.durationMinutes,
        selfCare: true,
      },
      now,
    );
    if (created.result !== "created") throw new Error("could not record the workout task");
    taskId = created.task.id;
  }

  const bests: NewBest[] = newBests(input.entries, await loadHistory(db));
  const { data: logId, error } = await db.rpc("record_workout", {
    p_day_id: (day?.id ?? null) as string,
    p_task_id: taskId,
    p_at: now.toISOString(),
    p_duration: input.durationMinutes,
    p_feel: (input.feel ?? null) as number,
    p_notes: (input.notes ?? null) as string,
    p_entries: input.entries.map((e) => ({ exercise: e.exercise, sets: e.sets, reps: e.reps, weight_kg: e.weightKg, seconds: e.seconds })) as unknown as Json,
  });
  if (error) throw new Error(`recording the workout: ${error.message}`);

  const completed: CompleteResult = await completeTask(db, taskId, now);
  return { logId, day: day?.name ?? null, planned: day !== null, completed, newBests: bests };
}

export async function loadTraining(db: Db, now: Date) {
  const { data, error } = await db
    .from("workout_logs")
    .select("at, workout_entries(exercise, sets, reps, weight_kg, seconds)")
    .order("at", { ascending: false });
  if (error) throw new Error(`loading training: ${error.message}`);
  return summarizeTraining(
    data.map((w) => ({
      at: new Date(w.at),
      entries: (w.workout_entries ?? []).map((e) => ({ ...e, weightKg: e.weight_kg === null ? null : Number(e.weight_kg) })),
    })),
    now,
  );
}
