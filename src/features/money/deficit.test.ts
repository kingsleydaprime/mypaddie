import { describe, expect, test } from "bun:test";
import { planDeficit, type NeedForDeficit } from "./deficit";

const need = (id: string, priority: number, floor: number, comfortable: number): NeedForDeficit => ({
  id,
  title: id,
  priority,
  floor,
  comfortable,
});

// The blueprint's numbers: needs ~150k comfortable, income ~100k.
const needs = [
  need("food", 1, 40_000, 60_000),
  need("transport", 2, 20_000, 30_000),
  need("data", 3, 10_000, 15_000),
  need("school-fees", 4, 45_000, 45_000),
];

describe("planDeficit", () => {
  test("gap is comfortable needs minus income, said as one number", () => {
    const plan = planDeficit(100_000, needs);
    expect(plan.gap).toBe(50_000);
    expect(plan.floorGap).toBe(15_000);
    expect(plan.hiddenWants).toBe(35_000);
  });

  test("savings and wants get nothing", () => {
    const plan = planDeficit(100_000, needs);
    expect(plan.savings).toBe(0);
    expect(plan.wants).toBe(0);
  });

  test("floors are funded in priority order before any comfort", () => {
    const plan = planDeficit(100_000, needs);
    expect(plan.allocations.map((a) => [a.id, a.allocated, a.floorCovered])).toEqual([
      ["food", 40_000, true],
      ["transport", 20_000, true],
      ["data", 10_000, true],
      ["school-fees", 30_000, false], // income runs out here
    ]);
    expect(plan.allocations[3]!.shortOfFloor).toBe(15_000);
  });

  test("leftover after all floors tops up towards comfortable, in priority order", () => {
    const plan = planDeficit(125_000, needs); // floors total 115k, 10k left
    expect(plan.allocations.map((a) => a.allocated)).toEqual([50_000, 20_000, 10_000, 45_000]);
  });

  test("input order doesn't matter — priority does", () => {
    const shuffled = [needs[3]!, needs[1]!, needs[0]!, needs[2]!];
    expect(planDeficit(100_000, shuffled).allocations.map((a) => a.id)).toEqual([
      "food",
      "transport",
      "data",
      "school-fees",
    ]);
  });

  test("allocations never exceed income", () => {
    for (const income of [0, 1, 39_999, 100_000, 149_999]) {
      const plan = planDeficit(income, needs);
      expect(plan.allocations.reduce((s, a) => s + a.allocated, 0)).toBe(income);
    }
  });

  test("zero income funds nothing and the gap is everything", () => {
    const plan = planDeficit(0, needs);
    expect(plan.allocations.every((a) => a.allocated === 0)).toBe(true);
    expect(plan.gap).toBe(150_000);
  });

  test("no needs → no gap", () => {
    expect(planDeficit(50_000, [])).toMatchObject({ gap: 0, floorGap: 0, hiddenWants: 0, allocations: [] });
  });

  test("rejects a floor above comfortable", () => {
    expect(() => planDeficit(10_000, [need("food", 1, 50_000, 40_000)])).toThrow(RangeError);
  });
});
