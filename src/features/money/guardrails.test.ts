import { describe, expect, test } from "bun:test";
import {
  billsDue,
  capFlag,
  capFor,
  capsThisMonth,
  capStatus,
  categoryKey,
  checkPayment,
  debtSummary,
  monthlyEquivalent,
  nextDue,
  paidRecently,
} from "./guardrails";

describe("caps", () => {
  test("categories match however they're typed", () => {
    expect(categoryKey("  Food ")).toBe(categoryKey("FOOD"));
  });
  test("status: spent, left, used", () => {
    expect(capStatus({ category: "Food", monthlyCap: 40000 }, 30000)).toEqual({ category: "Food", cap: 40000, spent: 30000, left: 10000, over: false, used: 75 });
  });
  test("over the cap: nothing left, flagged over", () => {
    const s = capStatus({ category: "Food", monthlyCap: 40000 }, 45000);
    expect(s.left).toBe(0);
    expect(s.over).toBe(true);
    expect(s.used).toBe(113);
  });
  test("exactly at the cap is not over", () => {
    expect(capStatus({ category: "Food", monthlyCap: 40000 }, 40000).over).toBe(false);
  });
  test("this month's spending is grouped by category, any case", () => {
    const s = capsThisMonth([{ category: "Food", monthlyCap: 40000 }, { category: "Data", monthlyCap: 10000 }], [
      { category: "food", amount: 5000 },
      { category: "Food ", amount: 2500 },
      { category: "Transport", amount: 9000 },
    ]);
    expect(s.map((x) => [x.category, x.spent])).toEqual([["Food", 7500], ["Data", 0]]);
    expect(capFor(s, "FOOD")?.left).toBe(32500);
    expect(capFor(s, "Transport")).toBeNull();
    expect(capFor(s, null)).toBeNull();
  });
  test("a spend that crosses the cap is flagged; one that fits isn't", () => {
    const before = capStatus({ category: "Food", monthlyCap: 40000 }, 35000);
    expect(capFlag(before, 5000)).toBeNull();
    expect(capFlag(before, 5001)).toEqual({ kind: "over_cap", category: "Food", cap: 40000, spentBefore: 35000, amount: 5001 });
    expect(capFlag(null, 1_000_000)).toBeNull();
  });
});

describe("nextDue", () => {
  test("weekly: seven days on", () => {
    expect(nextDue("week", "2026-10-02", "2026-10-30")).toBe("2026-11-06");
  });
  test("monthly on the 31st: end of a short month, then back to the 31st", () => {
    expect(nextDue("month", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextDue("month", "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextDue("month", "2026-01-31", "2026-03-31")).toBe("2026-04-30");
  });
  test("monthly across the year end", () => {
    expect(nextDue("month", "2026-01-15", "2026-12-15")).toBe("2027-01-15");
  });
  test("a leap-day bill falls on 28 Feb in other years, 29 in leap years", () => {
    expect(nextDue("year", "2028-02-29", "2028-02-29")).toBe("2029-02-28");
    expect(nextDue("year", "2028-02-29", "2031-02-28")).toBe("2032-02-29");
  });
});

describe("monthlyEquivalent", () => {
  test("weekly, monthly, yearly", () => {
    expect(monthlyEquivalent(1200, "week")).toBe(5200);
    expect(monthlyEquivalent(5000, "month")).toBe(5000);
    expect(monthlyEquivalent(60000, "year")).toBe(5000);
  });
});

describe("billsDue", () => {
  const bills = [
    { title: "Data", amount: 5000, nextDue: "2026-10-10", status: "active" as const },
    { title: "Netflix", amount: 4400, nextDue: "2026-10-05", status: "active" as const },
    { title: "Gym", amount: 15000, nextDue: "2026-10-30", status: "active" as const },
    { title: "Old sub", amount: 1000, nextDue: "2026-10-06", status: "paused" as const },
  ];
  test("active bills within the window, soonest first, overdue marked", () => {
    expect(billsDue(bills, "2026-10-07", 7).map((b) => [b.title, b.overdue])).toEqual([["Netflix", true], ["Data", false]]);
  });
  test("due today is not overdue", () => {
    expect(billsDue(bills, "2026-10-10", 0).map((b) => [b.title, b.overdue])).toEqual([["Netflix", true], ["Data", false]]);
  });
});

describe("debts", () => {
  test("a partial payment leaves the rest; the exact rest settles it", () => {
    expect(checkPayment({ amount: 10000, paid: 0, status: "open" }, 4000)).toEqual({ ok: true, settles: false, left: 6000 });
    expect(checkPayment({ amount: 10000, paid: 4000, status: "open" }, 6000)).toEqual({ ok: true, settles: true, left: 0 });
  });
  test("paying more than what's left is refused", () => {
    expect(checkPayment({ amount: 10000, paid: 4000, status: "open" }, 6001)).toEqual({ ok: false, reason: "more_than_owed", left: 6000 });
  });
  test("a settled or forgiven debt takes no payments", () => {
    expect(checkPayment({ amount: 10000, paid: 10000, status: "settled" }, 1).ok).toBe(false);
    expect(checkPayment({ amount: 10000, paid: 0, status: "forgiven" }, 1).ok).toBe(false);
  });
  test("summary: both directions, only what's left, overdue named", () => {
    const s = debtSummary([
      { person: "Tobi", direction: "i_owe", amount: 10000, paid: 4000, dueOn: "2026-10-01", status: "open" },
      { person: "Ada", direction: "owed_to_me", amount: 5000, paid: 0, dueOn: "2026-11-01", status: "open" },
      { person: "Old", direction: "i_owe", amount: 3000, paid: 3000, dueOn: null, status: "settled" },
      { person: "Gift", direction: "owed_to_me", amount: 2000, paid: 0, dueOn: "2026-09-01", status: "forgiven" },
    ], "2026-10-07");
    expect(s).toEqual({ iOwe: 6000, owedToMe: 5000, overdue: [{ person: "Tobi", direction: "i_owe", left: 6000, dueOn: "2026-10-01" }] });
  });
});

describe("paidRecently", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  test("never paid: no", () => {
    expect(paidRecently("month", null, now)).toBe(false);
  });
  test("a monthly bill paid 2 days ago: yes (a second payment is a repeat)", () => {
    expect(paidRecently("month", daysAgo(2), now)).toBe(true);
  });
  test("a monthly bill paid 20 days ago: no (next month's is legit)", () => {
    expect(paidRecently("month", daysAgo(20), now)).toBe(false);
  });
  test("weekly and yearly windows", () => {
    expect(paidRecently("week", daysAgo(2), now)).toBe(true);
    expect(paidRecently("week", daysAgo(4), now)).toBe(false);
    expect(paidRecently("year", daysAgo(100), now)).toBe(true);
  });
});
