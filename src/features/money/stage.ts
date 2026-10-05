import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { assertNaira, type Naira } from "@/shared/domain";
import { daysBetween } from "@/shared/time";

export type MoneyTag = "need" | "want" | "unsure";

export interface TransactionForMoney {
  amount: Naira;
  direction: "in" | "out";
  /** Required on outflows, absent on income. */
  tag: MoneyTag | null;
  category: string;
  at: Date;
}

export interface MoneyTotals {
  income: Naira;
  /** Need-tagged plus "unsure" outflows: overestimating needs is the safer mistake. */
  needs: Naira;
  wants: Naira;
  /** needs − income. Positive is a shortfall, negative is a surplus. */
  gap: number;
}

export interface Leak {
  category: string;
  amount: Naira;
}

/** Days counted from the first logged transaction, which is day 1. Inclusive. */
export interface MeasuredDays {
  fromDay: number;
  toDay: number;
}

export type MoneyStage =
  | { stage: "audit"; day: number; daysLeft: number; totals: MoneyTotals }
  | { stage: "deficit"; day: number; measured: MeasuredDays; totals: MoneyTotals; topLeaks: Leak[] }
  | { stage: "surplus"; day: number; measured: MeasuredDays; totals: MoneyTotals; topLeaks: Leak[] };

export function totalsOf(transactions: readonly TransactionForMoney[]): MoneyTotals {
  let income = 0;
  let needs = 0;
  let wants = 0;
  for (const t of transactions) {
    assertNaira(t.amount, "transaction amount");
    if (t.direction === "in") income += t.amount;
    else if (t.tag === "want") wants += t.amount;
    else needs += t.amount; // "need", "unsure", and an untagged outflow all count as needs
  }
  return { income, needs, wants, gap: needs - income };
}

/** The three want categories that took the most money — "where it leaked". */
export function topLeaks(transactions: readonly TransactionForMoney[], limit = 3): Leak[] {
  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.direction === "out" && t.tag === "want") {
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    }
  }
  return [...byCategory]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))
    .slice(0, limit);
}

/**
 * Which money stage you are in, from real numbers. Days count from the first
 * logged transaction (day 1) in fixed periods of `periodDays`:
 * - period 1 (and before anything is logged) is the audit: no judgement,
 * - after that, the last *complete* period decides: deficit when its needs
 *   exceed its income, otherwise surplus (exactly covered counts as covered).
 * The stage therefore holds steady for a whole period, and the first verdict
 * after the audit is exactly what the audit measured.
 */
export function computeMoneyStage(
  transactions: readonly TransactionForMoney[],
  now: Date,
  config: EngineConfig = DEFAULT_CONFIG,
): MoneyStage {
  const tz = config.timeZone;
  const period = config.money.periodDays;
  const past = transactions.filter((t) => t.at.getTime() <= now.getTime());

  if (past.length === 0) {
    return { stage: "audit", day: 0, daysLeft: period, totals: totalsOf([]) };
  }

  const first = past.reduce((a, b) => (b.at.getTime() < a.at.getTime() ? b : a));
  const dayOf = (at: Date) => daysBetween(first.at, at, tz) + 1;
  const day = dayOf(now);
  if (day <= period) {
    return { stage: "audit", day, daysLeft: period - day, totals: totalsOf(past) };
  }

  const currentPeriod = Math.floor((day - 1) / period); // 0 is the audit
  const measured = {
    fromDay: (currentPeriod - 1) * period + 1,
    toDay: currentPeriod * period,
  };
  const inPeriod = past.filter((t) => {
    const d = dayOf(t.at);
    return d >= measured.fromDay && d <= measured.toDay;
  });
  const totals = totalsOf(inPeriod);
  const leaks = topLeaks(inPeriod);
  return totals.gap > 0
    ? { stage: "deficit", day, measured, totals, topLeaks: leaks }
    : { stage: "surplus", day, measured, totals, topLeaks: leaks };
}
