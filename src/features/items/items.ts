import { currentConfig, type EngineConfig } from "@/shared/config";
import { PILLARS, type Pillar, type Tier } from "@/shared/domain";
import { goalCompletionBonus, wishFulfilledBonus, type XpEntry } from "@/features/xp/xp";
import type { PillarWeight } from "@/features/xp/split";

export type ItemStatus = "active" | "done" | "paused" | "dropped";

/** XP base for a goal with no finished task to anchor the bonus on (the task default). */
export const DEFAULT_ITEM_BASE_XP = 10;

/**
 * Which status changes make sense. Done is final for the bonus (it pays once,
 * enforced by the ledger), but an item marked done by mistake can be reopened.
 */
const ALLOWED: Record<ItemStatus, readonly ItemStatus[]> = {
  active: ["done", "paused", "dropped"],
  paused: ["active", "done", "dropped"],
  dropped: ["active"],
  done: ["active"],
};

export function canChangeStatus(from: ItemStatus, to: ItemStatus): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * An item has no pillar weights of its own; its work does. The bonus follows
 * where the effort went: every task's weights added up, then scaled back to
 * 100 by largest remainder (ties to the larger total, then pillar order).
 * Returns null when there's nothing to go on.
 */
export function itemWeights(taskWeights: readonly (readonly PillarWeight[])[]): PillarWeight[] | null {
  const totals = new Map<Pillar, number>();
  for (const weights of taskWeights) {
    for (const { pillar, weight } of weights) totals.set(pillar, (totals.get(pillar) ?? 0) + weight);
  }
  const sum = [...totals.values()].reduce((s, w) => s + w, 0);
  if (sum === 0) return null;

  const shares = [...totals].map(([pillar, total]) => {
    const exact = (total * 100) / sum;
    return { pillar, total, weight: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = 100 - shares.reduce((s, x) => s + x.weight, 0);
  const order = [...shares].sort(
    (a, b) => b.remainder - a.remainder || b.total - a.total || PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar),
  );
  for (const s of order) {
    if (leftover === 0) break;
    s.weight += 1;
    leftover -= 1;
  }
  return shares
    .filter((s) => s.weight > 0)
    .sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar))
    .map(({ pillar, weight }) => ({ pillar, weight }));
}

/**
 * The bonus for finishing an item, by tier (blueprint: goal 2×, wish +50).
 * Needs and wants are ongoing, so done is just a status. A dream pays through
 * its milestones, not by being ticked off.
 */
export function itemCompletionXp(
  tier: Tier,
  baseXp: number,
  weights: readonly PillarWeight[],
  config: EngineConfig = currentConfig(),
): XpEntry[] {
  if (tier === "goal") return goalCompletionBonus(baseXp, weights, config);
  if (tier === "wish") return wishFulfilledBonus(weights, config);
  return [];
}

/** Whether completing an item of this tier pays, so the caller knows to find weights. */
export function completionPays(tier: Tier): boolean {
  return tier === "goal" || tier === "wish";
}

/**
 * Money amounts only belong on needs (a DB constraint). Moving a need to
 * another tier drops them rather than failing.
 */
export function amountsForTier<T extends { floorAmount?: number | null; comfortableAmount?: number | null }>(
  tier: Tier,
  amounts: T,
): { floorAmount: number | null | undefined; comfortableAmount: number | null | undefined } {
  if (tier !== "need") return { floorAmount: null, comfortableAmount: null };
  return { floorAmount: amounts.floorAmount, comfortableAmount: amounts.comfortableAmount };
}
