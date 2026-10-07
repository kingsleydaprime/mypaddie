import type { PillarWeight } from "@/features/xp/split";
import { currentConfig, type EngineConfig } from "@/shared/config";
import { addDays, weekdayOf, withinLastDays } from "@/shared/time";

const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type WeekdayCode = (typeof CODES)[number];

/** "2026-10-05" → "MO" */
export const weekdayCode = (day: string): WeekdayCode => CODES[weekdayOf(day)]!;

export const parseWeekdays = (weekdays: string): WeekdayCode[] => weekdays.split(",") as WeekdayCode[];

/** The blueprint's own example split for exercise. */
export const WORKOUT_WEIGHTS: PillarWeight[] = [
  { pillar: "physical", weight: 50 },
  { pillar: "mental", weight: 30 },
  { pillar: "emotional", weight: 20 },
];

/** Base XP for a workout task: 1 per 5 minutes, between 5 and 60. */
export function workoutBaseXp(minutes: number): number {
  return Math.min(60, Math.max(5, Math.round(minutes / 5)));
}

/** First date on or after `from` that falls on one of the weekdays. */
export function firstTrainingDay(from: string, weekdays: readonly WeekdayCode[]): string {
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    if (weekdays.includes(weekdayCode(day))) return day;
  }
  throw new RangeError(`no training weekdays given`);
}

export interface PerformedEntry {
  exercise: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  seconds: number | null;
}

export interface HistoryEntry extends PerformedEntry {
  at: Date;
}

const key = (exercise: string) => exercise.trim().toLowerCase();

/**
 * How one performance ranks against another for the same exercise:
 * heavier wins; at the same weight more reps win. Timed holds compare seconds,
 * bodyweight work compares reps.
 */
function score(e: PerformedEntry): [number, number] {
  if (e.weightKg !== null && e.weightKg > 0) return [e.weightKg, e.reps ?? 0];
  if (e.seconds !== null) return [e.seconds, 0];
  return [e.reps ?? 0, 0];
}
const better = (a: PerformedEntry, b: PerformedEntry) => {
  const [a1, a2] = score(a);
  const [b1, b2] = score(b);
  return a1 > b1 || (a1 === b1 && a2 > b2);
};

/** The most recent time this exercise was done — "what to beat". */
export function lastPerformance(exercise: string, history: readonly HistoryEntry[]): HistoryEntry | null {
  const matches = history.filter((h) => key(h.exercise) === key(exercise));
  return matches.length ? matches.reduce((a, b) => (b.at > a.at ? b : a)) : null;
}

export function personalBest(exercise: string, history: readonly HistoryEntry[]): HistoryEntry | null {
  const matches = history.filter((h) => key(h.exercise) === key(exercise));
  return matches.length ? matches.reduce((a, b) => (better(b, a) ? b : a)) : null;
}

export interface NewBest {
  exercise: string;
  previous: PerformedEntry | null;
  now: PerformedEntry;
}

/**
 * Which of today's entries beat everything before them. A first-ever attempt
 * isn't a "new best" — there's nothing to beat yet.
 */
export function newBests(entries: readonly PerformedEntry[], history: readonly HistoryEntry[]): NewBest[] {
  return entries.flatMap((e) => {
    const best = personalBest(e.exercise, history);
    return best && better(e, best) ? [{ exercise: e.exercise, previous: best, now: e }] : [];
  });
}

export interface TrainingSummary {
  last7: number;
  last30: number;
  lastWorkout: Date | null;
  /** Best ever per exercise, heaviest first. */
  bests: { exercise: string; best: PerformedEntry; at: Date }[];
}

export function summarizeTraining(
  workouts: readonly { at: Date; entries: readonly PerformedEntry[] }[],
  now: Date,
  config: EngineConfig = currentConfig(),
): TrainingSummary {
  const tz = config.timeZone;
  const history: HistoryEntry[] = workouts.flatMap((w) => w.entries.map((e) => ({ ...e, at: w.at })));
  const names = [...new Map(history.map((h) => [key(h.exercise), h.exercise])).values()];
  return {
    last7: workouts.filter((w) => withinLastDays(w.at, now, 7, tz)).length,
    last30: workouts.filter((w) => withinLastDays(w.at, now, 30, tz)).length,
    lastWorkout: workouts.length ? workouts.reduce((a, b) => (b.at > a.at ? b : a)).at : null,
    bests: names
      .map((name) => {
        const best = personalBest(name, history)!;
        return { exercise: best.exercise, best, at: best.at };
      })
      .sort((a, b) => (b.best.weightKg ?? 0) - (a.best.weightKg ?? 0) || a.exercise.localeCompare(b.exercise)),
  };
}

/** A plan's rep target as a starting number for logging: "8-12" → 8, "10" → 10, "AMRAP" → null. */
export function repsToPrefill(target: string | null): number | null {
  const m = target?.match(/\d+/);
  return m ? Number(m[0]) : null;
}
