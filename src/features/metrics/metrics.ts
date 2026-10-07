import { addDays } from "@/shared/time";
import { periodOf } from "@/features/reviews/periods";

export const METRICS = ["sleep", "energy", "mood", "screen_time", "exercise", "learning", "spending", "word_kept"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_INFO: Record<Metric, { label: string; unit: string; agg: "avg" | "sum"; better: "up" | "down" }> = {
  sleep: { label: "Sleep", unit: "h a night", agg: "avg", better: "up" },
  energy: { label: "Energy", unit: "/5", agg: "avg", better: "up" },
  mood: { label: "Mood", unit: "/5", agg: "avg", better: "up" },
  screen_time: { label: "Screen time", unit: "h a day", agg: "avg", better: "down" },
  exercise: { label: "Workouts", unit: "a week", agg: "sum", better: "up" },
  learning: { label: "Study", unit: "h a week", agg: "sum", better: "up" },
  spending: { label: "Spending", unit: "a week", agg: "sum", better: "down" },
  word_kept: { label: "Word kept", unit: "% of promises", agg: "avg", better: "up" },
};

export interface Point {
  day: string;
  value: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** One value per week (Monday–Sunday), oldest first; a week with no data is null — never a zero. */
export function weeklySeries(points: readonly Point[], today: string, weeks: number, agg: "avg" | "sum"): { weekStart: string; value: number | null }[] {
  const thisWeek = periodOf("week", today).start;
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    const inWeek = points.filter((p) => p.day >= start && p.day <= end).map((p) => p.value);
    if (inWeek.length === 0) return { weekStart: start, value: null };
    const sum = inWeek.reduce((a, b) => a + b, 0);
    return { weekStart: start, value: round(agg === "sum" ? sum : sum / inWeek.length) };
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Where it's heading: the last two weeks against the four before. Changes
 * under 5% (or under a tenth of the scale for 1–5 ratings) are "steady" —
 * this is about direction, not daily perfection.
 */
export function trendOf(series: readonly { value: number | null }[], better: "up" | "down") {
  const vals = series.map((s) => s.value);
  const recent = mean(vals.slice(-2).filter((v): v is number => v !== null));
  const before = mean(vals.slice(-6, -2).filter((v): v is number => v !== null));
  if (recent === null || before === null) return { recent: recent === null ? null : round(recent), before: before === null ? null : round(before), direction: "not_enough" as const, good: null };
  const diff = recent - before;
  const threshold = Math.max(Math.abs(before) * 0.05, 0.1);
  const direction = Math.abs(diff) < threshold ? ("steady" as const) : diff > 0 ? ("up" as const) : ("down" as const);
  return { recent: round(recent), before: round(before), direction, good: direction === "steady" ? null : (direction === "up") === (better === "up") };
}

/**
 * An experiment's effect: the metric during it against the same number of
 * days just before. Fewer than 3 days on either side isn't enough to say.
 */
export function compareWindows(points: readonly Point[], startsOn: string, endsOn: string, today: string) {
  const end = endsOn < today ? endsOn : today;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1;
  const beforeStart = addDays(startsOn, -Math.max(days, 7));
  const before = points.filter((p) => p.day >= beforeStart && p.day < startsOn).map((p) => p.value);
  const during = points.filter((p) => p.day >= startsOn && p.day <= end).map((p) => p.value);
  const b = mean(before);
  const d = mean(during);
  if (before.length < 3 || during.length < 3 || b === null || d === null) {
    return { before: b === null ? null : round(b), during: d === null ? null : round(d), daysBefore: before.length, daysDuring: during.length, change: null, enoughData: false };
  }
  return { before: round(b), during: round(d), daysBefore: before.length, daysDuring: during.length, change: round(d - b), enoughData: true };
}
