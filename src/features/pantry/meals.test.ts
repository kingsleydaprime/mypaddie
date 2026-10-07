import { describe, expect, test } from "bun:test";
import { addDays } from "@/shared/time";
import type { PantryItem } from "./pantry";
import { openSlots, proposeMeals, recipeFromMeal, shoppingFor, shortfall, type Recipe } from "./meals";

const p = (name: string, quantity: number, unit = "cups"): PantryItem => ({ name, quantity, unit, category: "other", lowAt: null });
const r = (id: string, ingredients: [string, number, string?][], slots: string[] = []): Recipe => ({
  id,
  name: id,
  ingredients: ingredients.map(([name, quantity, unit]) => ({ name, quantity, unit: unit ?? "cups" })),
  slots,
});

describe("shortfall", () => {
  const stock = new Map([["rice", { quantity: 2, unit: "cups" }], ["eggs", { quantity: 6, unit: "pieces" }]]);
  test("enough of everything: nothing short", () => {
    expect(shortfall(r("x", [["Rice", 2]]), stock)).toEqual([]);
  });
  test("not enough: just the difference", () => {
    expect(shortfall(r("x", [["rice", 3]]), stock)).toEqual([{ name: "rice", quantity: 1, unit: "cups" }]);
  });
  test("not in the pantry, or in another unit: all of it", () => {
    expect(shortfall(r("x", [["beans", 1], ["eggs", 1, "kg"]]), stock)).toEqual([
      { name: "beans", quantity: 1, unit: "cups" },
      { name: "eggs", quantity: 1, unit: "kg" },
    ]);
  });
  test("unit spellings are normalised before comparing", () => {
    expect(shortfall(r("x", [["eggs", 2, "pcs"]]), stock)).toEqual([]);
  });
});

describe("proposeMeals", () => {
  const recipes = [
    r("Jollof", [["rice", 2], ["tomato", 1]], ["lunch", "dinner"]),
    r("Beans", [["beans", 2]], ["lunch", "dinner"]),
    r("Eggs", [["eggs", 2, "pieces"]], ["breakfast"]),
    r("Pap", [["pap", 1]], ["breakfast"]),
  ];
  const pantry = [p("rice", 2), p("tomato", 3), p("beans", 4), p("eggs", 6, "pieces")];

  test("makeable first, and each pick reserves its ingredients", () => {
    const { meals } = proposeMeals({
      slots: [{ day: "2026-10-08", slot: "Lunch" }, { day: "2026-10-08", slot: "Dinner" }],
      recipes, pantry, recent: [],
    });
    // Jollof uses the only 2 cups of rice at lunch, so dinner is Beans.
    expect(meals.map((m) => [m.slot, m.name, m.makeable])).toEqual([["Lunch", "Beans", true], ["Dinner", "Jollof", true]]);
  });

  test("a recipe only fills slots it suits", () => {
    const { meals } = proposeMeals({ slots: [{ day: "2026-10-08", slot: "Breakfast" }], recipes, pantry, recent: [] });
    expect(meals[0]!.name).toBe("Eggs");
  });

  test("something eaten yesterday waits, even if it's makeable", () => {
    const { meals } = proposeMeals({
      slots: [{ day: "2026-10-08", slot: "Lunch" }],
      recipes: recipes.slice(0, 2), pantry, recent: [{ name: "Beans", day: "2026-10-07" }],
    });
    expect(meals[0]!.name).toBe("Jollof");
  });

  test("turned down: never proposed this time", () => {
    const { meals } = proposeMeals({ slots: [{ day: "2026-10-08", slot: "Breakfast" }], recipes, pantry, recent: [], exclude: ["eggs"] });
    expect(meals[0]).toMatchObject({ name: "Pap", makeable: false, missing: [{ name: "pap", quantity: 1, unit: "cups" }] });
  });

  test("no suitable recipe: the slot is reported, not filled with nonsense", () => {
    const { meals, unfilled } = proposeMeals({ slots: [{ day: "2026-10-08", slot: "Supper" }], recipes, pantry, recent: [] });
    expect(meals).toEqual([]);
    expect(unfilled).toEqual([{ day: "2026-10-08", slot: "Supper" }]);
  });

  test("three days of lunch from two recipes rotate instead of repeating", () => {
    const { meals } = proposeMeals({
      slots: ["2026-10-08", "2026-10-09", "2026-10-10"].map((day) => ({ day, slot: "Lunch" })),
      recipes: recipes.slice(0, 2), pantry: [p("rice", 10), p("tomato", 10), p("beans", 10)], recent: [],
    });
    expect(meals.map((m) => m.name)).toEqual(["Beans", "Jollof", "Beans"]);
  });

  test("never the same dish twice in a day: the slot is left open instead", () => {
    const { meals, unfilled } = proposeMeals({
      slots: [{ day: "2026-10-08", slot: "Lunch" }, { day: "2026-10-08", slot: "Dinner" }],
      recipes: [recipes[0]!], pantry: [p("rice", 10), p("tomato", 10)], recent: [],
    });
    expect(meals.map((m) => m.slot)).toEqual(["Lunch"]);
    expect(unfilled).toEqual([{ day: "2026-10-08", slot: "Dinner" }]);
  });

  test("the shopping list adds up what the whole plan is short", () => {
    const { shopping } = proposeMeals({
      slots: ["2026-10-08", "2026-10-09"].map((day) => ({ day, slot: "Breakfast" })),
      recipes: [r("Pap", [["pap", 1]], ["breakfast"])], pantry: [], recent: [], gapDays: 0,
    });
    expect(shopping).toEqual([{ name: "pap", quantity: 2, unit: "cups" }]);
  });
});

describe("shoppingFor", () => {
  test("same ingredient in different units stays separate", () => {
    expect(shoppingFor([{ missing: [{ name: "oil", quantity: 1, unit: "l" }] }, { missing: [{ name: "Oil", quantity: 200, unit: "ml" }] }])).toHaveLength(2);
  });
});

describe("openSlots", () => {
  test("every meal over the days, minus what's already planned", () => {
    const s = openSlots("2026-10-08", 2, ["Breakfast", "Lunch"], [{ day: "2026-10-08", slot: "lunch" }], addDays);
    expect(s).toEqual([
      { day: "2026-10-08", slot: "Breakfast" },
      { day: "2026-10-09", slot: "Breakfast" },
      { day: "2026-10-09", slot: "Lunch" },
    ]);
  });
});

describe("recipeFromMeal", () => {
  test("a cooked meal with ingredients becomes a recipe for any meal", () => {
    expect(recipeFromMeal({ name: " Fried rice ", ingredients: [{ name: "rice", quantity: 2, unit: "cup" }] })).toEqual({
      name: "Fried rice", ingredients: [{ name: "rice", quantity: 2, unit: "cups" }], slots: [],
    });
  });
  test("no ingredients, nothing to learn", () => {
    expect(recipeFromMeal({ name: "Suya", ingredients: [] })).toBeNull();
  });
});
