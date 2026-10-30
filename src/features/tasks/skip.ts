import type { Tier } from "@/shared/domain";

/**
 * Skipping a must-do — a need, or anything marked non-negotiable — is a slip:
 * it takes a line on why, judged like any slip reason. Anything else is just
 * cancelled for the day: a decision, not ignoring it.
 */
export function skipNeedsReason(task: { isNonNegotiable: boolean; tier: Tier | null }): boolean {
  return task.isNonNegotiable || task.tier === "need";
}
