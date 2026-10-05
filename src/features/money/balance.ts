import { assertNaira, type Naira } from "@/shared/domain";

export interface BalanceEntry {
  amount: Naira;
  direction: "in" | "out";
  voided: boolean;
}

/** Real money: everything in (opening balance included) minus everything out, ignoring voided entries. */
export function balanceOf(entries: readonly BalanceEntry[]): number {
  return entries.reduce((sum, e) => (e.voided ? sum : sum + (e.direction === "in" ? e.amount : -e.amount)), 0);
}

export type Correction = { kind: "opening" | "adjustment"; direction: "in" | "out"; amount: Naira } | null;

/**
 * What to record so the balance matches what he says is really there. The
 * first time it's the opening balance; after that, a correction for the
 * difference (bank charges, a forgotten spend). Never counted as income or
 * spending — it only moves the balance.
 */
export function correctionFor(actual: Naira, current: number, hasHistory: boolean): Correction {
  assertNaira(actual, "balance");
  const diff = actual - current;
  if (diff === 0) return null;
  return { kind: hasHistory ? "adjustment" : "opening", direction: diff > 0 ? "in" : "out", amount: Math.abs(diff) };
}
