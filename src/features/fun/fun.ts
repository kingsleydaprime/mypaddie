import type { PillarWeight } from "@/features/xp/split";
import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import type { Mode } from "@/shared/domain";
import { dayKey } from "@/shared/time";

export const FUN_ENERGY = ["low", "medium", "high"] as const;
export type FunEnergy = (typeof FUN_ENERGY)[number];

export const FUN_COMPANY = ["solo", "together", "either"] as const;
export type FunCompany = (typeof FUN_COMPANY)[number];

export interface FunActivity {
  id: string;
  title: string;
  notes: string | null;
  /** Whole naira; 0 = free. */
  cost: number;
  minutes: number | null;
  energy: FunEnergy;
  company: FunCompany;
  active: boolean;
  timesDone: number;
  lastDoneAt: Date | null;
  createdAt: Date;
}

/** Fun pays like a normal task. Rest is part of the game, not a reward for finishing it. */
export const FUN_BASE_XP = 10;

/** With people it's social too; alone it's a mental reset. */
export function funWeights(withPeople: boolean): PillarWeight[] {
  return withPeople
    ? [{ pillar: "emotional", weight: 50 }, { pillar: "social", weight: 50 }]
    : [{ pillar: "emotional", weight: 70 }, { pillar: "mental", weight: 30 }];
}

/** Local calendar days from `at` to `now` (23:30 last night = 1 day ago). Null stays null. */
export function daysAgo(at: Date | null, now: Date, config: EngineConfig = DEFAULT_CONFIG): number | null {
  if (!at) return null;
  const tz = config.timeZone;
  return Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(at, tz)}T00:00:00Z`)) / 86_400_000);
}

/**
 * Days since any fun, counted in local calendar days. A list that's never been
 * used counts from when the first activity was added, so a brand-new list
 * doesn't read as "forever without fun". Null when there's no list.
 */
export function daysSinceFun(activities: readonly FunActivity[], now: Date, config: EngineConfig = DEFAULT_CONFIG): number | null {
  if (activities.length === 0) return null;
  const done = activities.map((a) => a.lastDoneAt).filter((d): d is Date => d !== null);
  const since = done.length
    ? new Date(Math.max(...done.map((d) => d.getTime())))
    : new Date(Math.min(...activities.map((a) => a.createdAt.getTime())));
  return daysAgo(since, now, config);
}

export interface FunContext {
  now: Date;
  /** Minutes free right now (a gap in the plan); null = not limited. */
  minutesFree?: number | null;
  /** Money stage: in a deficit, only free fun. */
  stage: "audit" | "deficit" | "surplus";
  /** What's left in the wants bucket; null = no budget yet (the audit). */
  wantsLeft: number | null;
  mode: Mode;
  /** Only things for this company; null/undefined = any. */
  withPeople?: boolean | null;
}

export type FunSkip = "too_long" | "over_budget" | "deficit" | "too_tiring" | "wrong_company";

export interface FunSuggestion {
  id: string;
  title: string;
  cost: number;
  minutes: number | null;
  energy: FunEnergy;
  company: FunCompany;
  /** Days since it was last done; null = never. */
  daysSince: number | null;
}

/** Why an activity doesn't fit right now; null = it does. First reason wins. */
export function whyNot(a: FunActivity, ctx: FunContext): FunSkip | null {
  if (ctx.minutesFree != null && a.minutes !== null && a.minutes > ctx.minutesFree) return "too_long";
  if (a.cost > 0 && ctx.stage === "deficit") return "deficit";
  if (a.cost > 0 && ctx.wantsLeft !== null && a.cost > ctx.wantsLeft) return "over_budget";
  // A soft day calls for an easy win, not a five-a-side.
  if ((ctx.mode === "soft" || ctx.mode === "softest") && a.energy === "high") return "too_tiring";
  if (ctx.withPeople === true && a.company === "solo") return "wrong_company";
  if (ctx.withPeople === false && a.company === "together") return "wrong_company";
  return null;
}

/**
 * What to do for fun right now: active activities that fit the time, the
 * money and the mood, the ones done least recently first (variety), cheaper
 * first on a tie. On a soft day, low-energy ones lead.
 */
export function suggestFun(activities: readonly FunActivity[], ctx: FunContext, limit = 3, config: EngineConfig = DEFAULT_CONFIG): FunSuggestion[] {
  const soft = ctx.mode === "soft" || ctx.mode === "softest";
  const energyRank: Record<FunEnergy, number> = { low: 0, medium: 1, high: 2 };
  return activities
    .filter((a) => a.active && whyNot(a, ctx) === null)
    .sort((a, b) => {
      if (soft && a.energy !== b.energy) return energyRank[a.energy] - energyRank[b.energy];
      const at = a.lastDoneAt?.getTime() ?? -Infinity;
      const bt = b.lastDoneAt?.getTime() ?? -Infinity;
      if (at !== bt) return at - bt;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      title: a.title,
      cost: a.cost,
      minutes: a.minutes,
      energy: a.energy,
      company: a.company,
      daysSince: daysAgo(a.lastDoneAt, ctx.now, config),
    }));
}
