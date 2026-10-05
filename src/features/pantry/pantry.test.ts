import { describe, expect, test } from "bun:test";
import { byCategory, normalizeUnit, shoppingList, stepFor, type PantryItem } from "./pantry";

describe("normalizeUnit", () => {
  test.each([
    ["Kilograms", "kg"],
    [" kgs ", "kg"],
    ["grams", "g"],
    ["Litre", "l"],
    ["pcs", "pieces"],
    ["can", "tins"],
    ["derica", "cups"],
    ["sachets", "packs"],
    ["", "pieces"],
    [null, "pieces"],
    ["handful", "handful"],
  ])("%p → %p", (input, out) => {
    expect(normalizeUnit(input)).toBe(out);
  });
});

const item = (name: string, quantity: number, lowAt: number | null = null, category = "other"): PantryItem => ({
  name,
  quantity,
  unit: "kg",
  category,
  lowAt,
});

describe("shoppingList", () => {
  test("out of stock first, then low; plenty isn't listed", () => {
    expect(shoppingList([item("Rice", 0.5, 1), item("Beans", 0), item("Garri", 3, 1), item("Yam", 1, 1)]).map((e) => `${e.name}:${e.reason}`)).toEqual([
      "Beans:out",
      "Rice:low",
      "Yam:low",
    ]);
  });
  test("no low level set: only listed when it runs out", () => {
    expect(shoppingList([item("Salt", 0.1)])).toEqual([]);
  });
});

describe("byCategory", () => {
  test("groups and sorts", () => {
    const groups = byCategory([item("Rice", 1, null, "grains"), item("Eggs", 1, null, "protein"), item("Beans", 1, null, "grains")]);
    expect(groups.map(([c, xs]) => `${c}: ${xs.map((x) => x.name).join(", ")}`)).toEqual(["grains: Beans, Rice", "protein: Eggs"]);
  });
});

describe("stepFor", () => {
  test.each([
    ["kg", 0.5],
    ["kilograms", 0.5],
    ["l", 0.5],
    ["g", 100],
    ["ml", 100],
    ["pieces", 1],
    ["tins", 1],
    ["handful", 1],
  ])("%p → %p", (unit, step) => {
    expect(stepFor(unit)).toBe(step);
  });
});
