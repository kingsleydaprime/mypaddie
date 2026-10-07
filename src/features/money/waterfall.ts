import { assertNaira, type Naira } from "@/shared/domain";

export interface SplitPercentages {
  savings: number;
  wants: number;
  /** Surprise needs and family support / black tax (open question in the blueprint). */
  flexible: number;
}

export const DEFAULT_SPLIT: SplitPercentages = { savings: 50, wants: 30, flexible: 20 };

export interface WaterfallInput {
  /** The new income entry being divided. */
  income: Naira;
  /** Needs still unfunded this month. */
  needsOutstanding: Naira;
  bufferBalance: Naira;
  bufferTarget: Naira;
  split?: SplitPercentages;
}

export interface WaterfallProposal {
  needs: Naira;
  buffer: Naira;
  savings: Naira;
  wants: Naira;
  flexible: Naira;
  /** True when this income could not even cover outstanding needs. */
  needsShort: boolean;
}

export function validateSplit(split: SplitPercentages): void {
  const parts = [split.savings, split.wants, split.flexible];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 100)) {
    throw new RangeError("split percentages must be whole numbers from 0 to 100");
  }
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== 100) throw new RangeError(`split percentages must sum to 100, got ${total}`);
}

/**
 * Proposes how a new income entry is divided — a proposal you accept, tweak
 * or reject, never an automatic move. Order matters:
 *   1. outstanding needs are paid first,
 *   2. the emergency buffer is filled before any investing,
 *   3. whatever is left is split by percentage (50/30/20 by default).
 * Every unit is accounted for: the five lines always sum to `income`.
 */
export function proposeWaterfall(input: WaterfallInput): WaterfallProposal {
  const split = input.split ?? DEFAULT_SPLIT;
  assertNaira(input.income, "income");
  assertNaira(input.needsOutstanding, "needsOutstanding");
  assertNaira(input.bufferBalance, "bufferBalance");
  assertNaira(input.bufferTarget, "bufferTarget");
  validateSplit(split);

  let remaining = input.income;

  const needs = Math.min(remaining, input.needsOutstanding);
  remaining -= needs;

  const bufferRoom = Math.max(0, input.bufferTarget - input.bufferBalance);
  const buffer = Math.min(remaining, bufferRoom);
  remaining -= buffer;

  // Largest remainder again, so rounding never loses or invents a unit.
  // Leftover units go to savings first, then flexible, then wants.
  const keys = ["savings", "flexible", "wants"] as const;
  const shares = keys.map((k) => {
    const exact = (remaining * split[k]) / 100;
    return { k, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = remaining - shares.reduce((s, x) => s + x.value, 0);
  for (const s of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover === 0) break;
    s.value += 1;
    leftover -= 1;
  }
  const part = (k: (typeof keys)[number]) => shares.find((s) => s.k === k)!.value;

  return {
    needs,
    buffer,
    savings: part("savings"),
    wants: part("wants"),
    flexible: part("flexible"),
    needsShort: needs < input.needsOutstanding,
  };
}
