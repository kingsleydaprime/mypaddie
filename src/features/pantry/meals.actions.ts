"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { acceptMeals } from "./meals.repo";

const PAGE = "/app/pantry/meals";
const meal = z.object({ day: z.iso.date(), slot: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), recipeId: z.uuid().nullable().optional() });

/** Accept the proposal shown (all of it, or one slot). The page sends exactly what it displayed. */
export async function acceptMealsAction(form: FormData) {
  const meals = z.array(meal).max(30).parse(JSON.parse(String(form.get("meals") ?? "[]")));
  await acceptMeals(await requireDb(PAGE), meals);
  revalidatePath(PAGE);
  revalidatePath("/app/plan");
  redirect(PAGE);
}

export async function removeMealAction(form: FormData) {
  const v = z.object({ day: z.iso.date(), slot: z.string().trim().min(1) }).parse(Object.fromEntries(form));
  await acceptMeals(await requireDb(PAGE), [], [v]);
  revalidatePath(PAGE);
  redirect(PAGE);
}
