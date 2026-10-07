import type { PillarWeight } from "@/features/xp/split";

/** Everything achievements are judged on — counted from data the app already keeps. */
export interface LifeStats {
  tasksDone: number;
  /** The best run of consecutive days any one habit was done, and which. */
  bestStreak: { days: number; habit: string } | null;
  workouts: number;
  studyMinutes: number;
  /** Savings + emergency buffer, whole units. */
  saved: number;
  bufferFull: boolean;
  promisesKeptOnTime: number;
  bucketTicks: number;
  contacts: number;
  reviews: number;
  funTimes: number;
  topLevel: number;
}

export interface Achievement {
  key: string;
  title: string;
  description: string;
  earned: (s: LifeStats) => boolean;
  /** What earned it, shown with it ("Reading"). */
  detail?: (s: LifeStats) => string | undefined;
}

const streak = (n: number, title: string): Achievement => ({
  key: `streak_${n}`,
  title,
  description: `${n} days in a row on one habit.`,
  earned: (s) => (s.bestStreak?.days ?? 0) >= n,
  detail: (s) => s.bestStreak?.habit,
});

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_task", title: "Day one", description: "Did the first thing.", earned: (s) => s.tasksDone >= 1 },
  { key: "tasks_100", title: "A hundred things", description: "100 tasks done.", earned: (s) => s.tasksDone >= 100 },
  { key: "tasks_1000", title: "A thousand things", description: "1,000 tasks done.", earned: (s) => s.tasksDone >= 1000 },
  streak(7, "One full week"),
  streak(30, "A month strong"),
  streak(100, "Hundred-day habit"),
  { key: "workouts_10", title: "Warming up", description: "10 workouts logged.", earned: (s) => s.workouts >= 10 },
  { key: "workouts_100", title: "Built different", description: "100 workouts logged.", earned: (s) => s.workouts >= 100 },
  { key: "study_10h", title: "Ten hours in", description: "10 hours of study or practice.", earned: (s) => s.studyMinutes >= 600 },
  { key: "study_100h", title: "Deep work", description: "100 hours of study or practice.", earned: (s) => s.studyMinutes >= 6000 },
  { key: "first_save", title: "First savings", description: "Money in savings for the first time.", earned: (s) => s.saved > 0 },
  { key: "buffer_full", title: "Cushioned", description: "Emergency buffer filled.", earned: (s) => s.bufferFull },
  { key: "promises_10", title: "Word kept", description: "10 promises kept on time.", earned: (s) => s.promisesKeptOnTime >= 10 },
  { key: "bucket_first", title: "Lived a little", description: "First bucket-list item done.", earned: (s) => s.bucketTicks >= 1 },
  { key: "bucket_10", title: "Collector of moments", description: "10 bucket-list items done.", earned: (s) => s.bucketTicks >= 10 },
  { key: "contacts_50", title: "Good paddy", description: "Reached out to people 50 times.", earned: (s) => s.contacts >= 50 },
  { key: "review_first", title: "Looked back", description: "First review written.", earned: (s) => s.reviews >= 1 },
  { key: "reviews_12", title: "Honest with yourself", description: "12 reviews written.", earned: (s) => s.reviews >= 12 },
  { key: "fun_10", title: "Remembered to live", description: "Had fun 10 times.", earned: (s) => s.funTimes >= 10 },
  { key: "level_5", title: "Level five", description: "A pillar reached level 5.", earned: (s) => s.topLevel >= 5 },
  { key: "level_10", title: "Level ten", description: "A pillar reached level 10.", earned: (s) => s.topLevel >= 10 },
];

/** An achievement is a moment: a small bonus, felt more than counted. */
export const ACHIEVEMENT_XP = 25;
export const ACHIEVEMENT_WEIGHTS: PillarWeight[] = [{ pillar: "character", weight: 50 }, { pillar: "emotional", weight: 50 }];

/** Newly earned: met now, not already held. */
export function newlyEarned(stats: LifeStats, held: ReadonlySet<string>) {
  return ACHIEVEMENTS.filter((a) => !held.has(a.key) && a.earned(stats)).map((a) => ({ key: a.key, title: a.title, description: a.description, detail: a.detail?.(stats) }));
}

/** Longest run of consecutive days in a sorted-or-not list of "YYYY-MM-DD". */
export function longestRun(days: readonly string[]): number {
  const uniq = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of uniq) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}
