import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { DEFAULT_CONFIG } from "@/shared/config";
import { amountsForTier, canChangeStatus, completionPays, itemCompletionXp, itemWeights } from "./items";

describe("canChangeStatus", () => {
  test("active can finish, pause or drop", () => {
    expect(canChangeStatus("active", "done")).toBe(true);
    expect(canChangeStatus("active", "paused")).toBe(true);
    expect(canChangeStatus("active", "dropped")).toBe(true);
  });
  test("paused can resume, finish or drop", () => {
    expect(canChangeStatus("paused", "active")).toBe(true);
    expect(canChangeStatus("paused", "done")).toBe(true);
    expect(canChangeStatus("paused", "dropped")).toBe(true);
  });
  test("done and dropped can only be reopened", () => {
    expect(canChangeStatus("done", "active")).toBe(true);
    expect(canChangeStatus("done", "dropped")).toBe(false);
    expect(canChangeStatus("dropped", "active")).toBe(true);
    expect(canChangeStatus("dropped", "done")).toBe(false);
  });
  test("no change is not a change", () => {
    expect(canChangeStatus("active", "active")).toBe(false);
  });
});

describe("itemWeights", () => {
  test("nothing to go on: null", () => {
    expect(itemWeights([])).toBeNull();
    expect(itemWeights([[]])).toBeNull();
  });
  test("one task: its weights", () => {
    expect(itemWeights([[{ pillar: "skills", weight: 70 }, { pillar: "academic", weight: 30 }]])).toEqual([
      { pillar: "skills", weight: 70 },
      { pillar: "academic", weight: 30 },
    ]);
  });
  test("several tasks: added up and scaled back to 100", () => {
    const w = itemWeights([
      [{ pillar: "physical", weight: 100 }],
      [{ pillar: "physical", weight: 50 }, { pillar: "mental", weight: 50 }],
    ]);
    expect(w).toEqual([
      { pillar: "mental", weight: 25 },
      { pillar: "physical", weight: 75 },
    ]);
    validateWeights(w!);
  });
  test("thirds still sum to exactly 100", () => {
    const w = itemWeights([[{ pillar: "spiritual", weight: 100 }], [{ pillar: "social", weight: 100 }], [{ pillar: "skills", weight: 100 }]])!;
    expect(w.reduce((s, x) => s + x.weight, 0)).toBe(100);
    validateWeights(w);
  });
  test("a sliver too small to round to 1 is left out, and it still sums to 100", () => {
    const tasks = Array.from({ length: 300 }, () => [{ pillar: "financial" as const, weight: 100 }]);
    const w = itemWeights([...tasks, [{ pillar: "creativity", weight: 1 }, { pillar: "financial", weight: 99 }]])!;
    expect(w).toEqual([{ pillar: "financial", weight: 100 }]);
  });
});

describe("itemCompletionXp", () => {
  const weights = [{ pillar: "skills" as const, weight: 100 }];
  test("a goal pays 2× the base", () => {
    expect(itemCompletionXp("goal", 30, weights, DEFAULT_CONFIG)).toEqual([{ pillar: "skills", amount: 60, reason: "goal_completion" }]);
  });
  test("a wish pays a flat +50 whatever the base", () => {
    expect(itemCompletionXp("wish", 999, weights, DEFAULT_CONFIG)).toEqual([{ pillar: "skills", amount: 50, reason: "wish_fulfilled" }]);
  });
  test("needs, wants and dreams pay nothing for being ticked off", () => {
    for (const tier of ["need", "want", "dream"] as const) {
      expect(itemCompletionXp(tier, 30, weights, DEFAULT_CONFIG)).toEqual([]);
      expect(completionPays(tier)).toBe(false);
    }
    expect(completionPays("goal")).toBe(true);
    expect(completionPays("wish")).toBe(true);
  });
  test("the bonus splits across pillars and adds back up", () => {
    const xp = itemCompletionXp("goal", 25, [{ pillar: "skills", weight: 67 }, { pillar: "academic", weight: 33 }], DEFAULT_CONFIG);
    expect(xp.reduce((s, e) => s + e.amount, 0)).toBe(50);
  });
});

describe("amountsForTier", () => {
  test("a need keeps its amounts", () => {
    expect(amountsForTier("need", { floorAmount: 5000, comfortableAmount: 8000 })).toEqual({ floorAmount: 5000, comfortableAmount: 8000 });
  });
  test("anything else drops them", () => {
    expect(amountsForTier("want", { floorAmount: 5000, comfortableAmount: 8000 })).toEqual({ floorAmount: null, comfortableAmount: null });
  });
});
