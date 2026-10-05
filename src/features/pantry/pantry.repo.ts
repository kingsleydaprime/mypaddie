import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { normalizeUnit, type PantryItem } from "./pantry";

export async function loadPantry(db: Db): Promise<PantryItem[]> {
  const { data, error } = await db.from("pantry_items").select("name, quantity, unit, category, low_at").order("name");
  if (error) throw new Error(`loading the pantry: ${error.message}`);
  return data.map((r) => ({ name: r.name, quantity: Number(r.quantity), unit: r.unit, category: r.category, lowAt: r.low_at === null ? null : Number(r.low_at) }));
}

export interface PantryChange {
  name: string;
  unit?: string;
  /** Add (positive) or use (negative). */
  delta?: number;
  /** The exact amount now — a stock-take. */
  set?: number;
  category?: string;
  lowAt?: number | null;
}

/** Several stock changes at once (a whole shopping trip), all or nothing. */
export async function adjustPantry(db: Db, changes: PantryChange[]) {
  const payload = changes.map((c) => ({
    name: c.name.trim(),
    ...(c.unit !== undefined ? { unit: normalizeUnit(c.unit) } : {}),
    ...(c.set !== undefined ? { set: c.set } : { delta: c.delta ?? 0 }),
    ...(c.category ? { category: c.category.trim().toLowerCase() } : {}),
    ...(c.lowAt !== undefined ? { low_at: c.lowAt } : {}),
  }));
  // A brand-new item needs a unit; catch it here with a clear message.
  const { data: existing } = await db.from("pantry_items").select("name");
  const known = new Set((existing ?? []).map((r) => r.name.toLowerCase()));
  const unitless = payload.filter((p) => !known.has(p.name.toLowerCase()) && !("unit" in p));
  if (unitless.length) throw new Error(`new items need a unit: ${unitless.map((p) => p.name).join(", ")}`);

  const { data, error } = await db.rpc("adjust_pantry", { p_changes: payload as unknown as Json });
  if (error) throw new Error(error.message);
  return data as { name: string; quantity: number; unit: string }[];
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export async function cookMeal(db: Db, meal: { name: string; ingredients: Ingredient[]; notes?: string; at?: string }) {
  const { data, error } = await db.rpc("cook_meal", {
    p_name: meal.name,
    p_ingredients: meal.ingredients.map((i) => ({ ...i, unit: normalizeUnit(i.unit) })) as unknown as Json,
    p_notes: (meal.notes ?? null) as string,
    p_at: (meal.at ?? null) as string,
  });
  if (error) throw new Error(error.message);
  return data as { meal_id: string; used: { name: string; quantity: number; unit: string }[]; missing: string[] };
}

export async function recentMeals(db: Db, days: number, now: Date) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data, error } = await db.from("meals").select("name, ingredients, notes, at").gte("at", since).order("at", { ascending: false });
  if (error) throw new Error(`loading meals: ${error.message}`);
  return data;
}
