import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Pillar, Tier } from "@/shared/domain";
import { dayKey, localTimeOf, startOfNextDay, zonedInstant } from "@/shared/time";
import { splitXp, type PillarWeight } from "./split";

/** Mirrors the `xp_reason` enum in Postgres. */
export type XpReason =
  | "completion"
  | "late_completion"
  | "ignored_need"
  | "goal_completion"
  | "wish_fulfilled"
  | "dream_milestone"
  | "transaction_logged"
  | "learning"
  | "broken_promise"
  | "undo"
  | "day_closed";

/** One row destined for `xp_log`. */
export interface XpEntry {
  pillar: Pillar;
  amount: number;
  reason: XpReason;
}

/** Mirrors the `task_status` enum in Postgres. */
export type TaskStatus = "pending" | "done" | "skipped" | "cancelled";

export interface TaskForXp {
  id: string;
  status: TaskStatus;
  /** Tier of the task's item; null for loose tasks such as chores. */
  tier: Tier | null;
  baseXp: number;
  dueAt: Date | null;
  doneAt: Date | null;
  weights: readonly PillarWeight[];
  /** A must-do. On a habit day (routine steps included), skipping it loses points like a need. */
  isNonNegotiable?: boolean;
  /** A habit row's local day ("YYYY-MM-DD"); null for one-off tasks. */
  occursOn?: string | null;
}

export interface SlipForXp {
  taskId: string;
  /** Whether Paddie accepted the reason. Only accepted slips protect a need. */
  accepted: boolean;
}

function scale(baseXp: number, multiplier: number): number {
  if (!Number.isSafeInteger(baseXp) || baseXp < 1) {
    throw new RangeError(`baseXp must be a positive whole number, got ${baseXp}`);
  }
  // Effort always earns something: never round a reward down to zero.
  return Math.max(1, Math.round(baseXp * multiplier));
}

function entries(amount: number, weights: readonly PillarWeight[], reason: XpReason): XpEntry[] {
  return splitXp(amount, weights).map((p) => ({ ...p, reason }));
}

export function isLate(task: Pick<TaskForXp, "dueAt">, doneAt: Date): boolean {
  return task.dueAt !== null && doneAt.getTime() > task.dueAt.getTime();
}

/**
 * When an "any time that day" task's day is over: the moment quiet hours start
 * (`dayEndsAt`, "HH:MM"). Any time is stored either as 23:59 on its day, or as
 * no time at all on a habit's day (`occursOn`). Null for anything else — a
 * real deadline, or a task with no day.
 */
export function anyTimeEndsAt(
  dueAt: Date | null,
  occursOn: string | null,
  dayEndsAt: string,
  config: EngineConfig = currentConfig(),
): Date | null {
  const day = dueAt === null ? occursOn : localTimeOf(dueAt, config.timeZone) === ANY_TIME ? dayKey(dueAt, config.timeZone) : null;
  return day === null ? null : endOfActiveDay(day, dayEndsAt, config);
}

/** "23:59" on a due time means "any time that day", not a real deadline. */
const ANY_TIME = "23:59";

function endOfActiveDay(day: string, dayEndsAt: string, config: EngineConfig): Date {
  // Quiet hours that start after midnight leave the whole calendar day.
  return dayEndsAt === ANY_TIME
    ? new Date(startOfNextDay(zonedInstant(day, "12:00", config.timeZone), config.timeZone).getTime() - 1)
    : zonedInstant(day, dayEndsAt, config.timeZone);
}

/**
 * When a task starts counting as late.
 *   - a deadline ("submit by 14:00"): its due time.
 *   - a time block (a duration, like a workout or a meeting): the due time is
 *     when it *starts*, so finishing it later that day is on time.
 *   - any time that day (23:59, or a habit day with no time): on time all day.
 * "That day" ends when quiet hours start (`dayEndsAt`): done after, it's done
 * late — still worth doing, for the late share. Without `dayEndsAt`, the
 * calendar day.
 */
export function lateAfter(
  dueAt: Date | null,
  durationMinutes: number | null,
  config: EngineConfig = currentConfig(),
  opts: { occursOn?: string | null; dayEndsAt?: string } = {},
): Date | null {
  const dayEnds = opts.dayEndsAt ?? ANY_TIME;
  const anyTime = anyTimeEndsAt(dueAt, opts.occursOn ?? null, dayEnds, config);
  if (anyTime) return anyTime;
  if (dueAt === null) return null;
  if (durationMinutes === null) return dueAt;
  // A block that starts after the day "ends" (a late class) has until the end of its calendar day.
  const end = endOfActiveDay(dayKey(dueAt, config.timeZone), dayEnds, config);
  return end > dueAt ? end : endOfActiveDay(dayKey(dueAt, config.timeZone), ANY_TIME, config);
}

/**
 * XP for finishing a task. Done on time pays full base XP; done after
 * `dueAt` pays the late share, because recovering fast beats dwelling.
 * Applies to every tier — trying always scores.
 */
export function completionXp(
  task: TaskForXp,
  doneAt: Date,
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  if (isLate(task, doneAt)) {
    return entries(scale(task.baseXp, config.xp.lateMultiplier), task.weights, "late_completion");
  }
  return entries(scale(task.baseXp, 1), task.weights, "completion");
}

/**
 * Non-negotiable habit days (routine steps, brushing…) count as needs from this
 * day on. Days before it were missed under the old rule, so they don't deduct.
 */
export const MUST_HABITS_DEDUCT_FROM = "2026-10-09";

/**
 * A need is ignored once its due day has fully ended (in the user's zone),
 * it was never done, and no accepted slip explains it. Only needs can be
 * ignored: wants, goals, wishes and dreams never deduct. A day of a
 * non-negotiable habit counts as a need, whatever its item (a routine's steps
 * have none); an any-time one is judged by its day. A deliberately cancelled
 * task was decided on, not ignored.
 */
export function isIgnoredNeed(
  task: TaskForXp,
  slips: readonly SlipForXp[],
  now: Date,
  config: EngineConfig = currentConfig(),
): boolean {
  const day = task.dueAt ? dayKey(task.dueAt, config.timeZone) : (task.occursOn ?? null);
  if (day === null) return false;
  const need = task.tier === "need" && task.dueAt !== null;
  const mustHabit = task.isNonNegotiable === true && task.occursOn != null && day >= MUST_HABITS_DEDUCT_FROM;
  if (!need && !mustHabit) return false;
  if (task.status === "done" || task.status === "cancelled" || task.doneAt !== null) return false;
  if (day >= dayKey(now, config.timeZone)) return false;
  return !slips.some((s) => s.taskId === task.id && s.accepted);
}

/** The deduction for an ignored need, or [] when nothing should be deducted. */
export function ignoredNeedDeduction(
  task: TaskForXp,
  slips: readonly SlipForXp[],
  now: Date,
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  if (!isIgnoredNeed(task, slips, now, config)) return [];
  return entries(-scale(task.baseXp, config.xp.ignoredNeedPenalty), task.weights, "ignored_need");
}

/** Bonus on top of the last task's XP when a goal is completed. */
export function goalCompletionBonus(
  baseXp: number,
  weights: readonly PillarWeight[],
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  return entries(scale(baseXp, config.xp.goalCompletionMultiplier), weights, "goal_completion");
}

/** Flat bonus when a wish happens. There is no counterpart penalty, by design. */
export function wishFulfilledBonus(
  weights: readonly PillarWeight[],
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  return entries(config.xp.wishBonus, weights, "wish_fulfilled");
}

export function dreamMilestoneBonus(
  baseXp: number,
  weights: readonly PillarWeight[],
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  return entries(scale(baseXp, config.xp.dreamMilestoneMultiplier), weights, "dream_milestone");
}

/**
 * Logging any transaction earns XP, including an honest dumb purchase, so
 * spending is never hidden. The amount and tag deliberately play no part.
 */
export function transactionLoggedXp(config: EngineConfig = currentConfig()): XpEntry[] {
  return [{ pillar: "financial", amount: config.xp.transactionLogXp, reason: "transaction_logged" }];
}
