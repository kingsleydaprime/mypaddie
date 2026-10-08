import { addDays } from "@/shared/time";

/**
 * Money guardrails: spending caps per category, recurring bills, and money
 * owed either way. Pure rules; the repo loads and stores.
 */

// ─── Spending caps ──────────────────────────────────────────────────────────

/** Categories are typed freely ("Food", "food ", "FOOD"); they match as one. */
export const categoryKey = (category: string) => category.trim().toLowerCase();

export interface Cap {
  category: string;
  monthlyCap: number;
}

export interface CapStatus {
  category: string;
  cap: number;
  spent: number;
  left: number;
  over: boolean;
  /** Share of the cap used, 0–100+ (whole percent). */
  used: number;
}

export function capStatus(cap: Cap, spent: number): CapStatus {
  return {
    category: cap.category,
    cap: cap.monthlyCap,
    spent,
    left: Math.max(0, cap.monthlyCap - spent),
    over: spent > cap.monthlyCap,
    used: Math.round((spent / cap.monthlyCap) * 100),
  };
}

/** Every cap against this month's spending in its category (voided and balance entries already excluded). */
export function capsThisMonth(caps: readonly Cap[], spending: readonly { category: string; amount: number }[]): CapStatus[] {
  const spent = new Map<string, number>();
  for (const s of spending) spent.set(categoryKey(s.category), (spent.get(categoryKey(s.category)) ?? 0) + s.amount);
  return caps.map((c) => capStatus(c, spent.get(categoryKey(c.category)) ?? 0));
}

export function capFor(statuses: readonly CapStatus[], category: string | null | undefined): CapStatus | null {
  if (!category) return null;
  return statuses.find((s) => categoryKey(s.category) === categoryKey(category)) ?? null;
}

export type CapFlag = { kind: "over_cap"; category: string; cap: number; spentBefore: number; amount: number };

/**
 * After the fact: did this spend break their own cap? Any tag counts — a cap
 * is a limit they set themselves, unlike the wants bucket. Like every flag, it
 * never costs XP.
 */
export function capFlag(before: CapStatus | null, amount: number): CapFlag | null {
  if (!before || before.spent + amount <= before.cap) return null;
  return { kind: "over_cap", category: before.category, cap: before.cap, spentBefore: before.spent, amount };
}

// ─── Recurring bills ────────────────────────────────────────────────────────

/** `once`: a payment due on one date (a course fee, a deposit); paying it finishes it. */
export type BillEvery = "once" | "week" | "month" | "year";

const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a year, month (1–12) and day, clamped to the month's last day. */
function clampedDay(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(Math.min(day, daysInMonth(year, month1)))}`;
}

/**
 * The due date after `due`. Months and years are counted from the bill's
 * first due date (`anchor`), so a bill on the 31st is due on 28/29 Feb and
 * back on the 31st in March, instead of drifting to the 28th for good.
 */
export function nextDue(every: BillEvery, anchor: string, due: string): string {
  // A one-off has no next date; paying it closes it, so its date just stays.
  if (every === "once") return due;
  if (every === "week") return addDays(due, 7);
  const anchorDay = Number(anchor.slice(8, 10));
  const year = Number(due.slice(0, 4));
  const month = Number(due.slice(5, 7));
  if (every === "year") return clampedDay(year + 1, Number(anchor.slice(5, 7)), anchorDay);
  return month === 12 ? clampedDay(year + 1, 1, anchorDay) : clampedDay(year, month + 1, anchorDay);
}

/** Half a period: a second payment inside it is almost certainly a repeat, not next month's bill. */
const REPEAT_WINDOW_DAYS: Record<BillEvery, number> = { once: 0, week: 3, month: 14, year: 182 };

/**
 * Was this bill paid so recently that paying again is likely a double tap or
 * a retried call? Paying ahead on purpose is allowed, but has to be said.
 */
export function paidRecently(every: BillEvery, lastPaidAt: Date | null, now: Date): boolean {
  if (!lastPaidAt) return false;
  return now.getTime() - lastPaidAt.getTime() < REPEAT_WINDOW_DAYS[every] * 86_400_000;
}

/** Roughly what a bill costs per month, for "your bills come to X a month". A one-off isn't a monthly cost. */
export function monthlyEquivalent(amount: number, every: BillEvery): number {
  if (every === "once") return 0;
  if (every === "week") return Math.round((amount * 52) / 12);
  if (every === "year") return Math.round(amount / 12);
  return amount;
}

/** What a repeating bill costs over a year — the number that makes a subscription worth questioning. */
export function yearlyEquivalent(amount: number, every: BillEvery): number {
  if (every === "once") return 0;
  return every === "week" ? amount * 52 : every === "month" ? amount * 12 : amount;
}

/** How many days before a free trial ends to ask "keep or cancel?". */
export const TRIAL_WARNING_DAYS = 2;

/** The day to decide on a free trial: a couple of days before it ends, or today if that's already passed. Null once it's ended. */
export function trialDecisionDay(trialEndsOn: string, today: string): string | null {
  if (trialEndsOn < today) return null;
  const ask = addDays(trialEndsOn, -TRIAL_WARNING_DAYS);
  return ask < today ? today : ask;
}

export interface BillForDue {
  title: string;
  amount: number;
  nextDue: string;
  status: "active" | "paused" | "ended";
}

/** Active bills due by `today + withinDays`, soonest first, each marked overdue or not. */
export function billsDue<T extends BillForDue>(bills: readonly T[], today: string, withinDays: number) {
  const until = addDays(today, withinDays);
  return bills
    .filter((b) => b.status === "active" && b.nextDue <= until)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .map((b) => ({ ...b, overdue: b.nextDue < today }));
}

// ─── Money owed ─────────────────────────────────────────────────────────────

/** i_owe: they lent me money. owed_to_me: I lent them money. */
export type DebtDirection = "i_owe" | "owed_to_me";

export interface DebtForSummary {
  person: string;
  direction: DebtDirection;
  amount: number;
  paid: number;
  dueOn: string | null;
  status: "open" | "settled" | "forgiven";
}

export const remaining = (d: Pick<DebtForSummary, "amount" | "paid">) => Math.max(0, d.amount - d.paid);

export type PaymentCheck = { ok: true; settles: boolean; left: number } | { ok: false; reason: "not_open" | "more_than_owed"; left: number };

/** A payment can't be more than what's left; paying exactly what's left settles it. */
export function checkPayment(d: Pick<DebtForSummary, "amount" | "paid" | "status">, payment: number): PaymentCheck {
  const left = remaining(d);
  if (d.status !== "open") return { ok: false, reason: "not_open", left };
  if (payment > left) return { ok: false, reason: "more_than_owed", left };
  return { ok: true, settles: payment === left, left: left - payment };
}

/** Totals both ways, and what's overdue (due before today, still open). */
export function debtSummary(debts: readonly DebtForSummary[], today: string) {
  const open = debts.filter((d) => d.status === "open" && remaining(d) > 0);
  const sum = (dir: DebtDirection) => open.filter((d) => d.direction === dir).reduce((s, d) => s + remaining(d), 0);
  return {
    iOwe: sum("i_owe"),
    owedToMe: sum("owed_to_me"),
    overdue: open
      .filter((d) => d.dueOn !== null && d.dueOn < today)
      .map((d) => ({ person: d.person, direction: d.direction, left: remaining(d), dueOn: d.dueOn! })),
  };
}
