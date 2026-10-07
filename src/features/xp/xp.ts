import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Pillar, Tier } from "@/shared/domain";
import { dayKey, startOfNextDay } from "@/shared/time";
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
  | "broken_promise";

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
 * When a task starts counting as late. For a deadline ("submit by 14:00") it's
 * the due time. For a time block — a task with a duration, like a workout or a
 * meeting — the due time is when it *starts*, so finishing it any time that
 * day is on time; it's only late once its day is over.
 */
export function lateAfter(dueAt: Date | null, durationMinutes: number | null, config: EngineConfig = currentConfig()): Date | null {
  if (dueAt === null) return null;
  if (durationMinutes === null) return dueAt;
  return new Date(startOfNextDay(dueAt, config.timeZone).getTime() - 1);
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
 * A need is ignored once its due day has fully ended (in the user's zone),
 * it was never done, and no accepted slip explains it. Only needs can be
 * ignored: wants, goals, wishes and dreams never deduct. A deliberately
 * cancelled task was decided on, not ignored.
 */
export function isIgnoredNeed(
  task: TaskForXp,
  slips: readonly SlipForXp[],
  now: Date,
  config: EngineConfig = currentConfig(),
): boolean {
  if (task.tier !== "need" || task.dueAt === null) return false;
  if (task.status === "done" || task.status === "cancelled" || task.doneAt !== null) return false;
  const dueDayOver = dayKey(task.dueAt, config.timeZone) < dayKey(now, config.timeZone);
  if (!dueDayOver) return false;
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
