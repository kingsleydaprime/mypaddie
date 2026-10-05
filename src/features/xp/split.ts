import { PILLARS, type Pillar } from "@/shared/domain";

export interface PillarWeight {
  pillar: Pillar;
  /** Whole percent, 1–100. A task's weights must sum to exactly 100. */
  weight: number;
}

export interface PillarAmount {
  pillar: Pillar;
  amount: number;
}

export class InvalidWeightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWeightsError";
  }
}

/** Throws InvalidWeightsError unless the weights are a valid split. Mirrors the DB constraint. */
export function validateWeights(weights: readonly PillarWeight[]): void {
  if (weights.length === 0) {
    throw new InvalidWeightsError("a task needs at least one pillar weight");
  }
  const seen = new Set<Pillar>();
  let total = 0;
  for (const { pillar, weight } of weights) {
    if (!PILLARS.includes(pillar)) {
      throw new InvalidWeightsError(`unknown pillar "${pillar}"`);
    }
    if (seen.has(pillar)) {
      throw new InvalidWeightsError(`pillar "${pillar}" appears twice`);
    }
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      throw new InvalidWeightsError(`weight for "${pillar}" must be a whole number from 1 to 100`);
    }
    seen.add(pillar);
    total += weight;
  }
  if (total !== 100) {
    throw new InvalidWeightsError(`weights must sum to 100, got ${total}`);
  }
}

/**
 * Splits a whole-number XP amount across pillars by weight, so the parts
 * always add back up to exactly `amount`.
 *
 * Uses the largest-remainder method: everyone gets the floor of their exact
 * share, then the leftover points go one each to the largest fractional
 * remainders. Ties go to the larger weight, then to pillar order, so the
 * result is deterministic. Negative amounts (deductions) split the same way.
 * Pillars whose share rounds to zero are left out of the result.
 */
export function splitXp(amount: number, weights: readonly PillarWeight[]): PillarAmount[] {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`XP amount must be a whole number, got ${amount}`);
  }
  validateWeights(weights);

  const sign = amount < 0 ? -1 : 1;
  const total = Math.abs(amount);

  const shares = weights.map((w) => {
    const exact = (total * w.weight) / 100;
    const floor = Math.floor(exact);
    return { ...w, floor, remainder: exact - floor };
  });

  let leftover = total - shares.reduce((sum, s) => sum + s.floor, 0);
  const byRemainder = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.weight - a.weight ||
      PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar),
  );
  for (const s of byRemainder) {
    if (leftover === 0) break;
    s.floor += 1;
    leftover -= 1;
  }

  return shares
    .filter((s) => s.floor > 0)
    .map((s) => ({ pillar: s.pillar, amount: sign * s.floor }));
}
