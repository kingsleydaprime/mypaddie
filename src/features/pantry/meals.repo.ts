import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import { escapeLike } from "@/shared/supabase/like";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, localTimeOf } from "@/shared/time";
import { normalizeUnit } from "./pantry";
import { loadPantry } from "./pantry.repo";
import { openSlots, proposeMeals, recipeFromMeal, type Recipe, type RecipeIngredient } from "./meals";

const tz = () => currentConfig().timeZone;
/** How far back "eaten recently" looks for variety. */
const RECENT_DAYS = 14;

export async function loadRecipes(db: Db): Promise<Recipe[]> {
  const { data, error } = await db.from("recipes").select("id, name, ingredients, slots").order("name");
  if (error) throw new Error(`loading recipes: ${error.message}`);
  return data.map((r) => ({ id: r.id, name: r.name, ingredients: r.ingredients as unknown as RecipeIngredient[], slots: r.slots }));
}

/** Save a recipe, or replace the one with the same name (any case). */
export async function saveRecipe(db: Db, recipe: { name: string; ingredients: RecipeIngredient[]; slots?: string[]; minutes?: number | null; notes?: string | null }) {
  const row = {
    name: recipe.name.trim(),
    ingredients: recipe.ingredients.map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: normalizeUnit(i.unit) })) as unknown as Json[],
    slots: (recipe.slots ?? []).map((s) => s.trim().toLowerCase()),
    minutes: recipe.minutes ?? null,
    notes: recipe.notes?.trim() || null,
  };
  const { data: existing } = await db.from("recipes").select("id").ilike("name", escapeLike(row.name)).maybeSingle();
  const { data, error } = existing
    ? await db.from("recipes").update(row).eq("id", existing.id).select("id, name").single()
    : await db.from("recipes").insert(row).select("id, name").single();
  if (error) throw new Error(`saving the recipe: ${error.message}`);
  return { result: existing ? ("updated" as const) : ("saved" as const), ...data };
}

export async function deleteRecipe(db: Db, name: string) {
  const { data, error } = await db.from("recipes").delete().ilike("name", escapeLike(name.trim())).select("name");
  if (error) throw new Error(`deleting the recipe: ${error.message}`);
  return data.length ? { result: "deleted" as const, name: data[0]!.name } : { result: "not_found" as const };
}

export async function loadMealPlan(db: Db, from: string, days: number) {
  const { data, error } = await db
    .from("meal_plans")
    .select("id, day, slot, name, status, recipe_id")
    .gte("day", from)
    .lt("day", addDays(from, days))
    .order("day");
  if (error) throw new Error(`loading the meal plan: ${error.message}`);
  return data;
}

/**
 * A proposal for every open meal slot from `start` (default: today's meals
 * still ahead) for `days` days. Read-only: nothing is saved until accepted.
 */
export async function proposeMealPlan(db: Db, now: Date, opts: { start?: string; days?: number; exclude?: string[]; replan?: boolean } = {}) {
  const today = dayKey(now, tz());
  const start = opts.start ?? today;
  const days = opts.days ?? 3;
  const [schedule, recipes, pantry, planned, eaten] = await Promise.all([
    loadSchedule(db),
    loadRecipes(db),
    loadPantry(db),
    loadMealPlan(db, start, days),
    db.from("meals").select("name, at").gte("at", new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString()).order("at", { ascending: false }),
  ]);
  if (eaten.error) throw new Error(`loading meals: ${eaten.error.message}`);

  const nowTime = localTimeOf(now, tz());
  const keep = planned.filter((p) => p.status !== "planned" || !opts.replan);
  const slots = openSlots(start, days, schedule.meals.map((m) => m.name), keep, addDays)
    // Today's meals that have already passed aren't worth planning.
    .filter((s) => s.day !== today || (schedule.meals.find((m) => m.name === s.slot)?.at ?? "23:59") > nowTime);
  // Already planned (and kept) meals count as "recent" too, so the proposal doesn't repeat them.
  const recent = [
    ...keep.map((p) => ({ name: p.name, day: p.day })),
    ...eaten.data.map((m) => ({ name: m.name, day: dayKey(new Date(m.at), tz()) })),
  ];
  const proposal = proposeMeals({ slots, recipes, pantry, recent, exclude: opts.exclude });
  return {
    start,
    days,
    alreadyPlanned: keep.map((p) => ({ day: p.day, slot: p.slot, name: p.name, status: p.status })),
    ...proposal,
    ...(recipes.length === 0 ? { hint: "No recipes yet. Save a few (save_recipe), or cook_meal with ingredients and they're learned." } : {}),
  };
}

/** Save chosen meals into their slots. A cooked slot is never overwritten; a planned one is replaced. */
export async function acceptMeals(db: Db, meals: { day: string; slot: string; name: string; recipeId?: string | null }[], remove: { day: string; slot: string }[] = []) {
  const results: { day: string; slot: string; name?: string; result: string }[] = [];
  for (const r of remove) {
    const { data } = await db.from("meal_plans").delete().eq("day", r.day).ilike("slot", escapeLike(r.slot)).eq("status", "planned").select("id");
    results.push({ ...r, result: data?.length ? "removed" : "not_found" });
  }
  for (const m of meals) {
    const { data: existing } = await db.from("meal_plans").select("id, status").eq("day", m.day).ilike("slot", escapeLike(m.slot)).maybeSingle();
    if (existing?.status === "cooked") {
      results.push({ ...m, result: "already_cooked" });
      continue;
    }
    let recipeId = m.recipeId ?? null;
    if (!recipeId) {
      const { data: recipe } = await db.from("recipes").select("id").ilike("name", escapeLike(m.name.trim())).maybeSingle();
      recipeId = recipe?.id ?? null;
    }
    const row = { day: m.day, slot: m.slot.trim(), name: m.name.trim(), recipe_id: recipeId, status: "planned" };
    const { error } = existing ? await db.from("meal_plans").update(row).eq("id", existing.id) : await db.from("meal_plans").insert(row);
    if (error) throw new Error(`saving the meal plan: ${error.message}`);
    results.push({ day: m.day, slot: m.slot, name: m.name, result: existing ? "replaced" : "planned" });
  }
  return results;
}

/**
 * After cook_meal: tick today's planned slot with that name (if there is one),
 * and learn the recipe if it's new and came with ingredients.
 */
export async function afterCooking(db: Db, meal: { mealId: string; name: string; ingredients: RecipeIngredient[] }, now: Date) {
  const today = dayKey(now, tz());
  const { data: planned } = await db
    .from("meal_plans")
    .update({ status: "cooked", meal_id: meal.mealId })
    .eq("day", today)
    .eq("status", "planned")
    .ilike("name", escapeLike(meal.name.trim()))
    .select("slot");
  let learned = false;
  const recipe = recipeFromMeal(meal);
  if (recipe) {
    const { data: known } = await db.from("recipes").select("id").ilike("name", escapeLike(recipe.name)).maybeSingle();
    if (!known) {
      await saveRecipe(db, recipe);
      learned = true;
    }
  }
  return { plannedSlot: planned?.[0]?.slot ?? null, recipeLearned: learned };
}

/** Today's planned meals by slot name, for get_today and Plan my day. */
export async function mealsForDay(db: Db, day: string): Promise<Map<string, string>> {
  const { data } = await db.from("meal_plans").select("slot, name").eq("day", day).neq("status", "skipped");
  return new Map((data ?? []).map((m) => [m.slot.toLowerCase(), m.name]));
}
