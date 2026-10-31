import { assertNaira, fromMinor, toMinor, type Naira } from "@/shared/domain";

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

  // Worked in minor units (kobo / cents), so a decimal income splits exactly too.
  let remaining = toMinor(input.income);

  const needs = Math.min(remaining, toMinor(input.needsOutstanding));
  remaining -= needs;

  const bufferRoom = Math.max(0, toMinor(input.bufferTarget) - toMinor(input.bufferBalance));
  const buffer = Math.min(remaining, bufferRoom);
  remaining -= buffer;

  // Split to the precision they gave: whole units when every amount is whole
  // (₦100,001 never becomes ₦50,000.50), kobo when any amount has kobo.
  const amounts = [input.income, input.needsOutstanding, input.bufferBalance, input.bufferTarget];
  const step = amounts.every(Number.isInteger) ? 100 : 1;

  // Largest remainder again, so rounding never loses or invents a unit.
  // Leftover units go to savings first, then flexible, then wants.
  const keys = ["savings", "flexible", "wants"] as const;
  const shares = keys.map((k) => {
    const exact = (remaining / step) * split[k] / 100;
    return { k, value: Math.floor(exact) * step, remainder: exact - Math.floor(exact) };
  });
  let leftover = remaining - shares.reduce((s, x) => s + x.value, 0);
  for (const s of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover === 0) break;
    s.value += step;
    leftover -= step;
  }
  const part = (k: (typeof keys)[number]) => fromMinor(shares.find((s) => s.k === k)!.value);

  return {
    needs: fromMinor(needs),
    buffer: fromMinor(buffer),
    savings: part("savings"),
    wants: part("wants"),
    flexible: part("flexible"),
    needsShort: needs < toMinor(input.needsOutstanding),
  };
}
