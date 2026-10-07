import type { XpEntry } from "@/features/xp/xp";
import { splitXp, type PillarWeight } from "@/features/xp/split";
import { currentConfig, type EngineConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";

/** Keeping your word builds character and the relationship. */
export const PROMISE_WEIGHTS: PillarWeight[] = [{ pillar: "character", weight: 60 }, { pillar: "relationships", weight: 40 }];
export const PROMISE_BASE_XP = 15;

export const PROMISE_STATUSES = ["open", "kept", "released", "broken"] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

export interface PromiseLike {
  status: PromiseStatus;
  /** When it's due; null = no deadline (never counts as broken). */
  dueAt: Date | null;
  keptAt: Date | null;
  /** They let him off it. */
  releasedAt: Date | null;
}

/**
 * Broken = its due day has fully ended (local time) and it wasn't kept or
 * released by the end of that day. Like a need, there's the rest of the day
 * to recover. Kept late still counts as broken — the late completion still
 * pays its (reduced) XP, but the word wasn't kept. Telling them in time and
 * moving the date (renegotiating) changes `dueAt`, so it isn't broken.
 */
export function isBroken(p: PromiseLike, now: Date, config: EngineConfig = currentConfig()): boolean {
  if (p.dueAt === null) return false;
  const tz = config.timeZone;
  const dueDay = dayKey(p.dueAt, tz);
  if (dueDay >= dayKey(now, tz)) return false;
  const settledOnTime = [p.keptAt, p.releasedAt].some((at) => at !== null && dayKey(at, tz) <= dueDay);
  return !settledOnTime;
}

/** The deduction for a broken promise: its full XP by default, split like its reward. */
export function brokenPromiseDeduction(p: PromiseLike, now: Date, config: EngineConfig = currentConfig()): XpEntry[] {
  if (!isBroken(p, now, config)) return [];
  const amount = Math.max(1, Math.round(PROMISE_BASE_XP * config.xp.brokenPromisePenalty));
  return splitXp(amount, PROMISE_WEIGHTS).map((e) => ({ ...e, amount: -e.amount, reason: "broken_promise" as const }));
}

/** Moving the date only counts while it's still open and its day hasn't ended. After that, it's broken. */
export function canRenegotiate(p: PromiseLike, now: Date, config: EngineConfig = currentConfig()): boolean {
  if (p.status !== "open") return false;
  if (p.dueAt === null) return true;
  return dayKey(p.dueAt, config.timeZone) >= dayKey(now, config.timeZone);
}

export interface PromiseRecord extends PromiseLike {
  person: string;
  what: string;
}

export interface PersonPattern {
  person: string;
  broken: number;
  kept: number;
}

/**
 * People he's let down more than once in the window: "the third broken
 * promise to Ada" is a pattern worth naming, one slip isn't.
 */
export function promisePatterns(
  promises: readonly PromiseRecord[],
  now: Date,
  windowDays = 90,
  config: EngineConfig = currentConfig(),
): PersonPattern[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const byPerson = new Map<string, PersonPattern>();
  for (const p of promises) {
    if (p.dueAt === null || p.dueAt.getTime() < since) continue;
    const key = p.person.trim().toLowerCase();
    const row = byPerson.get(key) ?? { person: p.person.trim(), broken: 0, kept: 0 };
    if (isBroken(p, now, config)) row.broken += 1;
    else if (p.keptAt) row.kept += 1;
    byPerson.set(key, row);
  }
  return [...byPerson.values()].filter((r) => r.broken >= 2).sort((a, b) => b.broken - a.broken);
}
