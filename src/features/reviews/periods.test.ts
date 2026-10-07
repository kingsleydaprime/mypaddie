import { describe, expect, test } from "bun:test";
import { periodOf, QUESTIONS, reviewsOwed, themesFor } from "./periods";

describe("periodOf", () => {
  test("weeks run Monday to Sunday", () => {
    expect(periodOf("week", "2026-10-14")).toMatchObject({ start: "2026-10-12", end: "2026-10-18", label: "Week of 12 Oct" }); // a Wednesday
    expect(periodOf("week", "2026-10-18")).toMatchObject({ start: "2026-10-12", end: "2026-10-18" }); // the Sunday
    expect(periodOf("week", "2026-10-19").start).toBe("2026-10-19"); // Monday starts a new one
  });
  test("months, quarters, years, including February and leap years", () => {
    expect(periodOf("month", "2026-10-14")).toEqual({ start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
    expect(periodOf("month", "2028-02-10").end).toBe("2028-02-29");
    expect(periodOf("quarter", "2026-11-03")).toEqual({ start: "2026-10-01", end: "2026-12-31", label: "Q4 2026" });
    expect(periodOf("quarter", "2026-02-03").end).toBe("2026-03-31");
    expect(periodOf("year", "2026-06-01")).toEqual({ start: "2026-01-01", end: "2026-12-31", label: "2026" });
  });
});

describe("reviewsOwed", () => {
  const none = new Set<string>();
  test("Sunday: this week's review", () => {
    expect(reviewsOwed("2026-10-18", none).map((r) => `${r.period}:${r.start}`)).toEqual(["week:2026-10-12"]);
  });
  test("still owed Monday and Tuesday; gone by Wednesday", () => {
    expect(reviewsOwed("2026-10-20", none).map((r) => r.period)).toEqual(["week"]);
    expect(reviewsOwed("2026-10-21", none)).toEqual([]);
  });
  test("done is done", () => {
    expect(reviewsOwed("2026-10-18", new Set(["week:2026-10-12"]))).toEqual([]);
  });
  test("month end, then three days of grace", () => {
    expect(reviewsOwed("2026-10-31", none).map((r) => r.period)).toEqual(["month"]); // a Saturday
    // 3 Nov is a Tuesday: the week ending Sunday 1 Nov is still owed too.
    expect(reviewsOwed("2026-11-03", none).map((r) => `${r.period}:${r.label}`)).toEqual(["month:October 2026", "week:Week of 26 Oct"]);
    expect(reviewsOwed("2026-11-04", none)).toEqual([]);
  });
  test("31 December: the year, quarter and month are all owed, biggest first", () => {
    expect(reviewsOwed("2026-12-31", none).map((r) => r.period)).toEqual(["year", "quarter", "month"]);
  });
});

describe("themesFor", () => {
  test("the year, quarter and month themes in force", () => {
    const themes = [
      { period: "year" as const, startsOn: "2026-01-01", title: "Year of Discipline" },
      { period: "month" as const, startsOn: "2026-10-01", title: "Month of Mercies" },
      { period: "month" as const, startsOn: "2026-09-01", title: "Old" },
    ];
    const t = themesFor(themes, "2026-10-14");
    expect(t.year?.title).toBe("Year of Discipline");
    expect(t.month?.title).toBe("Month of Mercies");
    expect(t.quarter).toBeUndefined();
  });
});

test("every review ends with what to change", () => {
  for (const qs of Object.values(QUESTIONS)) expect(qs.at(-1)!.key).toBe("change");
});
