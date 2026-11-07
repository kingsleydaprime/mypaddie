import { splitXp, type PillarAmount, type PillarWeight } from "@/features/xp/split";
import { addDays, dayKey, withinLastDays } from "@/shared/time";

/**
 * Quit tracker rules (docs/QUIT-TRACKER-PLAN.md, decided 2026-11-07).
 *
 * Two kinds:
 * - `quit`: zero is the goal. Every log is a relapse.
 * - `limit`: stay under a daily cap. A log is usage; a local day is *over*
 *   when its usage is more than the cap, and an over day counts as a relapse.
 *
 * Streaks, totals and milestones are derived here and never stored. Like the
 * rest of the engine, nothing reads the clock: callers pass `now`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type QuitKind = "quit" | "limit";
export type QuitUnit = "minutes" | "times";

/**
 * One tracked stretch. A quit has one open period while active. Ending,
 * pausing or changing the cap closes the period; resuming, restarting or the
 * new cap opens the next one.
 */
export interface QuitPeriod {
  startedAt: Date;
  endedAt: Date | null;
  /** For `limit`: the cap during this period. Null for `quit`. */
  limitPerDay: number | null;
  /**
   * For `limit`: the run carries on from the period before. Set when a cap is
   * lowered, so past days keep the cap they ran under without losing the streak.
   */
  continuesRun?: boolean;
}

export interface QuitLog {
  at: Date;
  /** For `limit`: minutes or times used. Ignored for `quit`. */
  amount: number | null;
}

export interface QuitProgress {
  /** Whole clean days in the current run; 0 when no period is open. */
  currentDays: number;
  /** When the current run began (attempt start, last relapse, or the day after the last over day). Null when not active. */
  runStartedAt: Date | null;
  longestDays: number;
  /** Finished local days with no relapse (quit) or within the cap (limit). */
  totalCleanDays: number;
  /** For `limit` with an open period: usage so far today, the cap and whether it's gone over. */
  today: { used: number; cap: number; over: boolean } | null;
}

// ── Milestones and XP ────────────────────────────────────────────────

/** Days clean → XP. Paid once per clean run; a relapse starts a new run that can earn them again (D3). */
export const MILESTONES: readonly { days: number; xp: number }[] = [
  { days: 1, xp: 5 },
  { days: 3, xp: 10 },
  { days: 7, xp: 20 },
  { days: 14, xp: 30 },
  { days: 30, xp: 50 },
  { days: 60, xp: 60 },
  { days: 90, xp: 80 },
  { days: 180, xp: 100 },
  { days: 365, xp: 150 },
];

/** +2 for logging a relapse or usage honestly, at most once a local day per quit (D1). */
export const HONESTY_XP = 2;

export const QUIT_WEIGHTS: readonly PillarWeight[] = [
  { pillar: "character", weight: 60 },
  { pillar: "mental", weight: 40 },
];

export const NOTE_MAX = 500;

/** The honesty bonus split across the quit pillars, ready for the ledger. */
export function honestyXp(): PillarAmount[] {
  return splitXp(HONESTY_XP, QUIT_WEIGHTS);
}

/** Milestones due, each with its XP split across the quit pillars. */
export function milestonePayouts(days: number, paidThisRun: readonly number[]) {
  return milestonesToPay(days, paidThisRun).map((m) => ({ days: m.days, xp: splitXp(m.xp, QUIT_WEIGHTS) }));
}

/** Milestones crossed in a run of `days` that haven't been paid for this run yet. */
export function milestonesToPay(days: number, paidThisRun: readonly number[]): { days: number; xp: number }[] {
  const paid = new Set(paidThisRun);
  return MILESTONES.filter((m) => m.days <= days && !paid.has(m.days));
}

/** The next milestone ahead of a run, or null once the last one is behind it. */
export function nextMilestone(days: number): { days: number; daysLeft: number } | null {
  const next = MILESTONES.find((m) => m.days > days);
  return next ? { days: next.days, daysLeft: next.days - days } : null;
}

/**
 * Whether logging now earns the honesty bonus. Keyed to the day it's logged,
 * not the day of the slip, so backdating several slips can't earn it several times.
 */
export function honestyDue(now: Date, bonusDays: ReadonlySet<string>, timeZone: string): boolean {
  return !bonusDays.has(dayKey(now, timeZone));
}

// ── Validation ───────────────────────────────────────────────────────

export class QuitRuleError extends Error {}

/** A `limit` needs a positive whole-number cap and a unit; a `quit` has neither. */
export function validateSetup(kind: QuitKind, limitPerDay: number | null, unit: QuitUnit | null): void {
  if (kind === "quit") {
    if (limitPerDay !== null || unit !== null) throw new QuitRuleError("Quitting completely has no daily cap.");
    return;
  }
  if (unit === null) throw new QuitRuleError("Cutting down needs a unit: minutes or times.");
  if (limitPerDay === null || !Number.isInteger(limitPerDay) || limitPerDay < 1) {
    throw new QuitRuleError("The daily cap must be a whole number of at least 1. A cap of 0 is quitting completely.");
  }
}

/** Checks a log before it's saved. Returns the cleaned note. */
export function validateLog(
  kind: QuitKind,
  log: { at: Date; amount: number | null; note?: string | null },
  periods: readonly QuitPeriod[],
  now: Date,
): string | null {
  if (log.at.getTime() > now.getTime()) throw new QuitRuleError("That time is in the future.");
  if (kind === "limit") {
    if (log.amount === null || !Number.isInteger(log.amount) || log.amount < 1) {
      throw new QuitRuleError("Usage must be a whole number of at least 1.");
    }
  } else if (log.amount !== null) {
    throw new QuitRuleError("A relapse has no amount.");
  }
  const inPeriod = periods.some(
    (p) => p.startedAt.getTime() <= log.at.getTime() && (p.endedAt === null || log.at.getTime() <= p.endedAt.getTime()),
  );
  if (!inPeriod) throw new QuitRuleError("That time is outside the time this was being tracked.");
  const note = log.note?.trim() || null;
  if (note && note.length > NOTE_MAX) throw new QuitRuleError(`The note is too long (at most ${NOTE_MAX} characters).`);
  return note;
}

/** Raising the cap starts a new attempt, so a looser cap can't rewrite past over days. Lowering doesn't. */
export function capChangeStartsNewAttempt(oldCap: number, newCap: number): boolean {
  return newCap > oldCap;
}

/**
 * What a cap change does. Either way the open period closes and a new one
 * opens under the new cap, so every past day keeps the cap it ran under and
 * the new cap applies from today. Only a lowered cap carries the run on.
 */
export function capChange(oldCap: number, newCap: number): "raised" | "lowered" | "unchanged" {
  if (newCap === oldCap) return "unchanged";
  return capChangeStartsNewAttempt(oldCap, newCap) ? "raised" : "lowered";
}

/**
 * What Paddie may call a quit (D5). The real name only when it's been turned
 * on for that quit; otherwise the alias, or a neutral phrase.
 */
export function aiLabel(quit: { title: string; alias: string | null; showNameToAi: boolean }): string {
  if (quit.showNameToAi) return quit.title;
  return quit.alias ?? "a habit you're quitting";
}

/**
 * The label for places that show on screen to anyone nearby, or to Paddie in
 * every reply (the mode's reasons): the alias only, whatever the setting.
 */
export function privateLabel(quit: { alias: string | null }): string {
  return quit.alias ?? "a habit you're quitting";
}

// ── Progress ─────────────────────────────────────────────────────────

function sortedPeriods(periods: readonly QuitPeriod[]): QuitPeriod[] {
  return [...periods].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

/** Local days from `from` to `to` inclusive. */
function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Whether a local day of a period is over and done with: before today, and (for a closed period) before its last day. */
function finished(day: string, today: string, lastDay: string, open: boolean): boolean {
  return day < today && (open || day < lastDay);
}

export function quitProgress(
  kind: QuitKind,
  periods: readonly QuitPeriod[],
  logs: readonly QuitLog[],
  now: Date,
  timeZone: string,
): QuitProgress {
  const past = logs.filter((l) => l.at.getTime() <= now.getTime());
  return kind === "quit"
    ? quitKindProgress(sortedPeriods(periods), past, now, timeZone)
    : limitKindProgress(sortedPeriods(periods), past, now, timeZone);
}

function quitKindProgress(periods: QuitPeriod[], logs: readonly QuitLog[], now: Date, tz: string): QuitProgress {
  const today = dayKey(now, tz);
  const relapseDays = new Set(logs.map((l) => dayKey(l.at, tz)));
  let longest = 0;
  let total = 0;
  let current = 0;
  let runStartedAt: Date | null = null;

  for (const p of periods) {
    const open = p.endedAt === null;
    const end = p.endedAt ?? now;
    const relapses = logs
      .map((l) => l.at.getTime())
      .filter((t) => t >= p.startedAt.getTime() && t <= end.getTime())
      .sort((a, b) => a - b);

    // Runs are measured in 24-hour days between start, each relapse, and the end.
    const bounds = [p.startedAt.getTime(), ...relapses, end.getTime()];
    for (let i = 1; i < bounds.length; i++) {
      longest = Math.max(longest, Math.floor((bounds[i] - bounds[i - 1]) / DAY_MS));
    }
    if (open) {
      const from = bounds[bounds.length - 2];
      current = Math.floor((now.getTime() - from) / DAY_MS);
      runStartedAt = new Date(from);
    }

    const lastDay = dayKey(end, tz);
    for (const d of daysFrom(dayKey(p.startedAt, tz), lastDay)) {
      if (finished(d, today, lastDay, open) && !relapseDays.has(d)) total++;
    }
  }

  return { currentDays: current, runStartedAt, longestDays: longest, totalCleanDays: total, today: null };
}

function limitKindProgress(periods: QuitPeriod[], logs: readonly QuitLog[], now: Date, tz: string): QuitProgress {
  const today = dayKey(now, tz);
  // A day's usage counts in full whichever period it was logged in, so raising
  // the cap halfway through a day doesn't forget the morning.
  const usage = new Map<string, number>();
  for (const l of logs) {
    const d = dayKey(l.at, tz);
    usage.set(d, (usage.get(d) ?? 0) + (l.amount ?? 0));
  }

  let longest = 0;
  let total = 0;
  let current = 0;
  let runStartedAt: Date | null = null;
  let todayState: QuitProgress["today"] = null;
  let run = 0;
  let runStart: Date = periods[0]?.startedAt ?? now;
  let lastCounted: string | null = null;

  for (const p of periods) {
    const cap = p.limitPerDay ?? 0;
    const open = p.endedAt === null;
    const lastDay = dayKey(p.endedAt ?? now, tz);
    if (!p.continuesRun) {
      run = 0;
      runStart = p.startedAt;
    }

    for (const d of daysFrom(dayKey(p.startedAt, tz), lastDay)) {
      const over = (usage.get(d) ?? 0) > cap;
      if (over) {
        // Back to 0 from that day; the run restarts the next local day.
        run = 0;
        runStart = localMidnight(addDays(d, 1), tz);
        continue;
      }
      // Today counts as clean until it goes over, but isn't added until it ends.
      if (!finished(d, today, lastDay, open)) continue;
      // A day split across two periods (a cap change) is only counted once.
      if (d === lastCounted) continue;
      lastCounted = d;
      run++;
      total++;
      longest = Math.max(longest, run);
    }

    if (open) {
      current = run;
      runStartedAt = runStart;
      const used = usage.get(today) ?? 0;
      todayState = { used, cap, over: used > cap };
    }
  }

  return { currentDays: current, runStartedAt, longestDays: longest, totalCleanDays: total, today: todayState };
}

/** First instant of a local day. */
function localMidnight(day: string, tz: string): Date {
  // Same search as startOfNextDay: the earliest minute whose local day is `day`.
  const MINUTE = 60 * 1000;
  let lo = Math.floor(Date.parse(`${day}T00:00:00Z`) / MINUTE) - 15 * 60; // before it in every zone
  let hi = lo + 30 * 60;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid * MINUTE), tz) < day) lo = mid;
    else hi = mid;
  }
  return new Date(hi * MINUTE);
}

// ── Coaching mode ────────────────────────────────────────────────────

/** Relapses (quit) or over days (limit) needed in the last few days to call it a rough patch. */
export const ROUGH_PATCH = { relapses: 2, days: 3 } as const;

/**
 * A rough patch on one quit: 2+ relapses, or 2+ over days, in the last 3
 * local days. It can only move the mode towards soft, never strict (D4); the
 * mode feature decides what to do with it.
 */
export function inRoughPatch(
  kind: QuitKind,
  periods: readonly QuitPeriod[],
  logs: readonly QuitLog[],
  now: Date,
  timeZone: string,
): boolean {
  const recent = logs.filter((l) => l.at.getTime() <= now.getTime() && withinLastDays(l.at, now, ROUGH_PATCH.days, timeZone));
  if (kind === "quit") return recent.length >= ROUGH_PATCH.relapses;

  const capOn = (day: string): number | null => {
    for (const p of sortedPeriods(periods)) {
      const first = dayKey(p.startedAt, timeZone);
      const last = dayKey(p.endedAt ?? now, timeZone);
      // On the day a cap was raised, the old cap applies: going over it that
      // day is still a slip worth noticing.
      if (first <= day && day <= last) return p.limitPerDay;
    }
    return null;
  };
  const usage = new Map<string, number>();
  for (const l of recent) {
    const d = dayKey(l.at, timeZone);
    usage.set(d, (usage.get(d) ?? 0) + (l.amount ?? 0));
  }
  let overDays = 0;
  for (const [day, used] of usage) {
    const cap = capOn(day);
    if (cap !== null && used > cap) overDays++;
  }
  return overDays >= ROUGH_PATCH.relapses;
}
