"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { addPromise, keepPromise, releasePromise, renegotiatePromise } from "./promises.repo";

export type PromiseFormState = null | { ok: true; message?: string } | { error: string };

const refresh = () => {
  revalidatePath("/app/promises");
  revalidatePath("/app");
};

export async function addPromiseAction(_prev: PromiseFormState, form: FormData): Promise<PromiseFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const person = get("person");
  const what = get("what");
  if (!person) return { error: "Who did you promise?" };
  if (!what) return { error: "What did you promise?" };
  const date = get("date");
  const db = await requireDb("/app/promises");
  const made = await addPromise(db, { person, what, due: date ? { date, time: get("time") || null } : null }, new Date());
  refresh();
  return { ok: true, message: made.dayFull ? "Saved — but that day is already full. Consider telling them a later date." : "Saved." };
}

export async function keepPromiseAction(id: string) {
  const db = await requireDb("/app/promises");
  await keepPromise(db, id, new Date());
  refresh();
}

export async function releasePromiseAction(id: string) {
  const db = await requireDb("/app/promises");
  await releasePromise(db, id, new Date());
  refresh();
}

export async function renegotiateAction(id: string, form: FormData) {
  const date = String(form.get("date") ?? "").trim();
  if (!date) return;
  const db = await requireDb("/app/promises");
  await renegotiatePromise(db, id, { date, time: String(form.get("time") ?? "").trim() || null }, new Date());
  refresh();
}
