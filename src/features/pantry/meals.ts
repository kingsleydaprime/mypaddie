import { normalizeUnit, type PantryItem } from "./pantry";

/**
 * Meal planning: pick a recipe for each meal slot over the next few days, from
 * what's in the pantry, with variety. Pure; the repo loads and saves.
 */

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  /** Meal names it suits ("breakfast", "lunch"…), lowercase. Empty = any meal. */
  slots: string[];
}

export interface PlannedSlot {
  day: string;
  /** The meal's name from their schedule ("Lunch"). */
  slot: string;
}

export interface ProposedMeal extends PlannedSlot {
  recipeId: string;
  name: string;
  /** Everything is in stock (after what earlier meals in this plan use). */
  makeable: boolean;
  missing: RecipeIngredient[];
}

const key = (s: string) => s.trim().toLowerCase();

/** Stock by name, in its unit. An ingredient in a different unit than the pantry's doesn't match (no conversions). */
function stockMap(pantry: readonly PantryItem[]) {
  return new Map(pantry.map((p) => [key(p.name), { quantity: p.quantity, unit: normalizeUnit(p.unit) }]));
}

/** What's short for one recipe, given what's left in stock. */
export function shortfall(recipe: Pick<Recipe, "ingredients">, stock: ReadonlyMap<string, { quantity: number; unit: string }>): RecipeIngredient[] {
  return recipe.ingredients.flatMap((i) => {
    const have = stock.get(key(i.name));
    const unit = normalizeUnit(i.unit);
    if (!have || have.unit !== unit) return [{ name: i.name, quantity: i.quantity, unit }];
    const short = round(i.quantity - have.quantity);
    return short > 0 ? [{ name: i.name, quantity: short, unit }] : [];
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

function suits(recipe: Recipe, slot: string): boolean {
  return recipe.slots.length === 0 || recipe.slots.includes(key(slot));
}

export interface ProposeInput {
  slots: readonly PlannedSlot[];
  recipes: readonly Recipe[];
  pantry: readonly PantryItem[];
  /** Recipe names eaten recently, newest first, with the day eaten. */
  recent: readonly { name: string; day: string }[];
  /** Don't propose these (they were turned down this time). */
  exclude?: readonly string[];
  /** A recipe isn't repeated within this many days (eaten or planned). */
  gapDays?: number;
}

/**
 * For each slot in order (never a dish already picked that day): the recipe that suits the slot, then can be made
 * from what's left (each pick reserves its ingredients), then hasn't been
 * eaten or planned within the gap, then the one eaten longest ago, then by
 * name. A slot with no suitable recipe is left out and reported.
 */
export function proposeMeals(input: ProposeInput) {
  const gap = input.gapDays ?? 2;
  const stock = stockMap(input.pantry);
  const excluded = new Set((input.exclude ?? []).map(key));
  const lastDay = new Map<string, string>();
  for (const r of [...input.recent].reverse()) lastDay.set(key(r.name), r.day);

  const picks: ProposedMeal[] = [];
  const unfilled: PlannedSlot[] = [];
  for (const s of input.slots) {
    const tooRecent = (name: string) => {
      const last = lastDay.get(key(name));
      return last !== undefined && daysBetween(last, s.day) < gap;
    };
    // Never the same dish twice in one day, however well it fits the pantry.
    const sameDay = new Set(picks.filter((p) => p.day === s.day).map((p) => key(p.name)));
    const ranked = input.recipes
      .filter((r) => suits(r, s.slot) && !excluded.has(key(r.name)) && !sameDay.has(key(r.name)))
      .map((r) => ({ r, missing: shortfall(r, stock) }))
      .sort(
        (a, b) =>
          Number(a.missing.length > 0) - Number(b.missing.length > 0) ||
          Number(tooRecent(a.r.name)) - Number(tooRecent(b.r.name)) ||
          (lastDay.get(key(a.r.name)) ?? "").localeCompare(lastDay.get(key(b.r.name)) ?? "") ||
          a.missing.length - b.missing.length ||
          a.r.name.localeCompare(b.r.name),
      );
    const best = ranked[0];
    if (!best) {
      unfilled.push(s);
      continue;
    }
    picks.push({ ...s, recipeId: best.r.id, name: best.r.name, makeable: best.missing.length === 0, missing: best.missing });
    lastDay.set(key(best.r.name), s.day);
    // Reserve what it uses, so the next slot sees what's really left.
    for (const i of best.r.ingredients) {
      const have = stock.get(key(i.name));
      if (have && have.unit === normalizeUnit(i.unit)) have.quantity = Math.max(0, round(have.quantity - i.quantity));
    }
  }
  return { meals: picks, unfilled, shopping: shoppingFor(picks) };
}

/** Everything missing across the plan, added up per ingredient and unit. */
export function shoppingFor(meals: readonly Pick<ProposedMeal, "missing">[]): RecipeIngredient[] {
  const total = new Map<string, RecipeIngredient>();
  for (const m of meals) {
    for (const i of m.missing) {
      const k = `${key(i.name)}|${i.unit}`;
      const prev = total.get(k);
      total.set(k, prev ? { ...prev, quantity: round(prev.quantity + i.quantity) } : { ...i });
    }
  }
  return [...total.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every meal slot over `days` days from `start`, in time order, skipping ones already planned. */
export function openSlots(start: string, days: number, mealNames: readonly string[], planned: readonly PlannedSlot[], addDays: (d: string, n: number) => string): PlannedSlot[] {
  const taken = new Set(planned.map((p) => `${p.day}|${key(p.slot)}`));
  const out: PlannedSlot[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    for (const slot of mealNames) if (!taken.has(`${day}|${key(slot)}`)) out.push({ day, slot });
  }
  return out;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A recipe learned from a cooked meal: the same ingredients, any slot until told otherwise. */
export function recipeFromMeal(meal: { name: string; ingredients: readonly RecipeIngredient[] }): Omit<Recipe, "id"> | null {
  if (meal.ingredients.length === 0) return null;
  return { name: meal.name.trim(), ingredients: meal.ingredients.map((i) => ({ ...i, unit: normalizeUnit(i.unit) })), slots: [] };
}
