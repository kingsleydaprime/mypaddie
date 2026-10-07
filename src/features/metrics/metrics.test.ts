import { describe, expect, test } from "bun:test";
import { compareWindows, trendOf, weeklySeries, type Point } from "./metrics";

const days = (from: string, n: number, value: (i: number) => number): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { day: d, value: value(i) };
  });

describe("weeklySeries", () => {
  test("weekly averages or sums, Monday–Sunday, oldest first; empty weeks are null not zero", () => {
    const pts = [{ day: "2026-10-12", value: 6 }, { day: "2026-10-14", value: 8 }, { day: "2026-10-01", value: 5 }];
    expect(weeklySeries(pts, "2026-10-16", 3, "avg")).toEqual([
      { weekStart: "2026-09-28", value: 5 },
      { weekStart: "2026-10-05", value: null },
      { weekStart: "2026-10-12", value: 7 },
    ]);
    expect(weeklySeries(pts, "2026-10-16", 1, "sum")[0]!.value).toBe(14);
  });
});

describe("trendOf", () => {
  const s = (...v: (number | null)[]) => v.map((value) => ({ value }));
  test("better when up: rising is good", () => {
    expect(trendOf(s(6, 6, 6, 6, 7.5, 7.5), "up")).toMatchObject({ direction: "up", good: true, recent: 7.5, before: 6 });
  });
  test("better when down: rising screen time is not good", () => {
    expect(trendOf(s(3, 3, 3, 3, 5, 5), "down")).toMatchObject({ direction: "up", good: false });
  });
  test("small wobbles are steady", () => {
    expect(trendOf(s(7, 7, 7, 7, 7.2, 7.1), "up")).toMatchObject({ direction: "steady", good: null });
  });
  test("not enough history: says so", () => {
    expect(trendOf(s(null, null, null, null, 7, 7), "up").direction).toBe("not_enough");
  });
});

describe("compareWindows", () => {
  test("during vs the same span just before", () => {
    const sleep = [...days("2026-09-24", 14, () => 6), ...days("2026-10-08", 14, () => 7.5)];
    expect(compareWindows(sleep, "2026-10-08", "2026-10-21", "2026-10-22")).toMatchObject({ before: 6, during: 7.5, change: 1.5, enoughData: true });
  });
  test("still running: counts up to today", () => {
    const sleep = [...days("2026-09-24", 14, () => 6), ...days("2026-10-08", 5, () => 7)];
    expect(compareWindows(sleep, "2026-10-08", "2026-10-21", "2026-10-12")).toMatchObject({ daysDuring: 5, during: 7, enoughData: true });
  });
  test("too few days on either side: not enough to tell", () => {
    expect(compareWindows(days("2026-10-08", 5, () => 7), "2026-10-08", "2026-10-21", "2026-10-22")).toMatchObject({ enoughData: false, change: null, daysBefore: 0 });
  });
});
