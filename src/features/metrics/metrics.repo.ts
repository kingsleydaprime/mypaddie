import { loadSchedule } from "@/features/settings/settings.repo";
import { completeTask, createTask, updateTask } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import { compareWindows, METRIC_INFO, METRICS, trendOf, weeklySeries, type Metric, type Point } from "./metrics";

const tz = () => currentConfig().timeZone;
const local = (iso: string) => dayKey(new Date(iso), tz());

export interface CheckinInput {
  /** Local date; default today (sleep is often logged for last night the next morning). */
  date?: string;
  energy?: number | null;
  sleepHours?: number | null;
  mood?: number | null;
  screenMinutes?: number | null;
  note?: string | null;
}

/** Merges into that day's check-in: logging mood later doesn't wipe the sleep logged this morning. */
export async function logCheckin(db: Db, input: CheckinInput, now: Date) {
  const day = input.date ?? dayKey(now, tz());
  const patch = {
    day,
    ...(input.energy !== undefined ? { energy: input.energy } : {}),
    ...(input.sleepHours !== undefined ? { sleep_hours: input.sleepHours } : {}),
    ...(input.mood !== undefined ? { mood: input.mood } : {}),
    ...(input.screenMinutes !== undefined ? { screen_minutes: input.screenMinutes } : {}),
    ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
  };
  if (Object.keys(patch).length === 1) return { result: "nothing_to_log" as const };
  const { error } = await db.from("checkins").upsert(patch, { onConflict: "user_id,day" });
  if (error) throw new Error(`saving the check-in: ${error.message}`);
  const { data } = await db.from("checkins").select("day, energy, sleep_hours, mood, screen_minutes, note").eq("day", day).maybeSingle();
  return { result: "logged" as const, checkin: data };
}

/** Daily values for one metric between two local dates, from wherever it's already recorded. */
export async function loadPoints(db: Db, metric: Metric, from: string, to: string): Promise<Point[]> {
  const fromAt = zonedInstant(from, "00:00", tz()).toISOString();
  const toAt = zonedInstant(addDays(to, 1), "00:00", tz()).toISOString();
  const perDay = (rows: { day: string; v: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.day, (m.get(r.day) ?? 0) + r.v);
    return [...m].map(([day, value]) => ({ day, value }));
  };
  switch (metric) {
    case "sleep":
    case "energy":
    case "mood":
    case "screen_time": {
      const col = { sleep: "sleep_hours", energy: "energy", mood: "mood", screen_time: "screen_minutes" }[metric];
      const { data } = await db.from("checkins").select(`day, ${col}`).gte("day", from).lte("day", to).not(col, "is", null);
      return ((data ?? []) as unknown as Record<string, number | string>[]).map((r) => ({ day: String(r.day), value: metric === "screen_time" ? Number(r[col]) / 60 : Number(r[col]) }));
    }
    case "exercise": {
      const { data } = await db.from("workout_logs").select("at").gte("at", fromAt).lt("at", toAt);
      return perDay((data ?? []).map((r) => ({ day: local(r.at), v: 1 })));
    }
    case "learning": {
      const { data } = await db.from("learning_sessions").select("at, minutes").gte("at", fromAt).lt("at", toAt);
      return perDay((data ?? []).map((r) => ({ day: local(r.at), v: r.minutes / 60 })));
    }
    case "spending": {
      const { data } = await db.from("transactions").select("at, amount").eq("kind", "normal").eq("direction", "out").is("voided_at", null).gte("at", fromAt).lt("at", toAt);
      return perDay((data ?? []).map((r) => ({ day: local(r.at), v: r.amount })));
    }
    case "word_kept": {
      // Settled promises by due day: 100 kept on time, 0 broken.
      const { data } = await db.from("promises").select("due_at, status").in("status", ["kept", "broken"]).gte("due_at", fromAt).lt("due_at", toAt);
      return (data ?? []).map((r) => ({ day: local(r.due_at!), value: r.status === "kept" ? 100 : 0 }));
    }
  }
}

/** Every metric over the last `weeks` weeks: the weekly line and which way it's heading. */
export async function loadTrends(db: Db, now: Date, weeks = 8, only?: Metric) {
  const today = dayKey(now, tz());
  const from = addDays(today, -7 * weeks);
  const metrics = only ? [only] : [...METRICS];
  const { weekStart } = await loadSchedule(db);
  return Promise.all(
    metrics.map(async (m) => {
      const info = METRIC_INFO[m];
      const series = weeklySeries(await loadPoints(db, m, from, today), today, weeks, info.agg, weekStart);
      return { metric: m, label: info.label, unit: info.unit, better: info.better, series, trend: trendOf(series, info.better) };
    }),
  );
}

// ─── Experiments ────────────────────────────────────────────────────────────
export const CONCLUSIONS = ["helped", "no_difference", "made_worse", "unclear"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];

export async function startExperiment(db: Db, input: { change: string; question?: string | null; metric?: string | null; days?: number; startsOn?: string }, now: Date) {
  const today = dayKey(now, tz());
  const starts = input.startsOn && input.startsOn > today ? input.startsOn : today;
  const ends = addDays(starts, (input.days ?? 14) - 1);
  const task = await createTask(
    db,
    { title: `Experiment ends: ${input.change.trim()}`.slice(0, 200), itemId: null, baseXp: 10, dueDate: ends, dueTime: null, recurrence: null, nonNegotiable: false, weights: [{ pillar: "mental", weight: 60 }, { pillar: "character", weight: 40 }], durationMinutes: 10 },
    now,
  );
  const { data, error } = await db
    .from("experiments")
    .insert({ change: input.change.trim(), question: input.question?.trim() || null, metric: input.metric ?? null, starts_on: starts, ends_on: ends, task_id: task.result === "created" ? task.task.id : null })
    .select("id")
    .single();
  if (error) throw new Error(`starting the experiment: ${error.message}`);
  return { result: "started" as const, id: data.id, startsOn: starts, endsOn: ends };
}

export async function loadExperiments(db: Db, now: Date) {
  const today = dayKey(now, tz());
  const { data, error } = await db.from("experiments").select("id, change, question, metric, starts_on, ends_on, status, conclusion, result").order("starts_on", { ascending: false });
  if (error) throw new Error(`loading experiments: ${error.message}`);
  return Promise.all(
    data.map(async (e) => {
      const tracked = METRICS.includes(e.metric as Metric) ? (e.metric as Metric) : null;
      const comparison = tracked ? compareWindows(await loadPoints(db, tracked, addDays(e.starts_on, -60), today), e.starts_on, e.ends_on, today) : null;
      return { ...e, daysLeft: e.status === "running" ? Math.max(0, Math.round((Date.parse(`${e.ends_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) : null, due: e.status === "running" && e.ends_on <= today, comparison };
    }),
  );
}

/**
 * The verdict. Completes its "Experiment ends" task; with `savePattern`, the
 * finding becomes a pattern in About me ("my sleep improves when…").
 */
export async function finishExperiment(db: Db, id: string, input: { conclusion: Conclusion; result?: string | null; savePattern?: string | null; abandon?: boolean }, now: Date) {
  const { data: e } = await db.from("experiments").select("id, change, task_id").eq("id", id).maybeSingle();
  if (!e) return { result: "not_found" as const };
  await db.from("experiments").update({ status: input.abandon ? "abandoned" : "done", conclusion: input.abandon ? null : input.conclusion, result: input.result?.trim() || null }).eq("id", id);
  if (e.task_id) {
    if (input.abandon) await updateTask(db, e.task_id, {}, "cancel", now);
    else await completeTask(db, e.task_id, now);
  }
  if (input.savePattern?.trim()) {
    await db.from("self_notes").insert({ kind: "pattern", title: input.savePattern.trim().slice(0, 200), detail: `From the experiment: ${e.change}` });
  }
  return { result: input.abandon ? ("abandoned" as const) : ("finished" as const), patternSaved: Boolean(input.savePattern?.trim()) };
}

/** Running experiments whose last day has come — cheap enough for get_today (no comparisons). */
export async function dueExperiments(db: Db, now: Date) {
  const { data, error } = await db.from("experiments").select("id, change, question, metric, ends_on").eq("status", "running").lte("ends_on", dayKey(now, tz())).order("ends_on");
  if (error) throw new Error(`loading experiments: ${error.message}`);
  return data;
}

export async function loadCheckin(db: Db, day: string) {
  const { data } = await db.from("checkins").select("day, energy, sleep_hours, mood, screen_minutes, note").eq("day", day).maybeSingle();
  return data;
}
