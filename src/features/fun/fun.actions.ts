"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { FUN_COMPANY, FUN_ENERGY, type FunCompany, type FunEnergy } from "./fun";
import { addFun, logFun, updateFun, type FunInput } from "./fun.repo";

export type FunFormState = null | { ok: true } | { error: string };

function readForm(form: FormData): FunInput | { error: string } {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const title = get("title");
  if (!title) return { error: "Name it" };
  if (title.length > 100) return { error: "Keep the name under 100 characters" };
  const cost = get("cost") ? Number(get("cost")) : 0;
  if (!Number.isInteger(cost) || cost < 0) return { error: "Cost is a whole number (0 = free)" };
  const minutes = get("minutes") ? Number(get("minutes")) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) return { error: "Time is 5 to 1440 minutes" };
  const energy = get("energy") as FunEnergy;
  const company = get("company") as FunCompany;
  return {
    title,
    notes: get("notes") || null,
    cost,
    minutes,
    energy: FUN_ENERGY.includes(energy) ? energy : "medium",
    company: FUN_COMPANY.includes(company) ? company : "either",
  };
}

const refresh = () => {
  revalidatePath("/app/fun");
  revalidatePath("/app");
};

export async function addFunAction(_prev: FunFormState, form: FormData): Promise<FunFormState> {
  const input = readForm(form);
  if ("error" in input) return input;
  const db = await requireDb("/app/fun");
  const result = await addFun(db, input);
  if (result.result === "exists") return { error: `"${input.title}" is already on your list` };
  refresh();
  return { ok: true };
}

export async function editFunAction(id: string, _prev: FunFormState, form: FormData): Promise<FunFormState> {
  const input = readForm(form);
  if ("error" in input) return input;
  const db = await requireDb("/app/fun");
  const result = await updateFun(db, id, input);
  if (result.result === "exists") return { error: `"${input.title}" is already on your list` };
  if (result.result === "not_found") return { error: "That one's gone — refresh the page" };
  refresh();
  return { ok: true };
}

export async function toggleFunAction(id: string, active: boolean) {
  const db = await requireDb("/app/fun");
  await updateFun(db, id, { active });
  refresh();
}

export async function removeFunAction(id: string) {
  const db = await requireDb("/app/fun");
  await updateFun(db, id, { remove: true });
  refresh();
}

export async function didFunAction(id: string) {
  const db = await requireDb("/app/fun");
  await logFun(db, { activity: id }, new Date());
  refresh();
}
