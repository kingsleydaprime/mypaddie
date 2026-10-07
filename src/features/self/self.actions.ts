"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { SELF_KINDS, type SelfKind } from "./self";
import { addSelfNote, updateSelfNote } from "./self.repo";

export type SelfFormState = null | { ok: true } | { error: string };

export async function addSelfNoteAction(_prev: SelfFormState, form: FormData): Promise<SelfFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") as SelfKind;
  if (!SELF_KINDS.includes(kind)) return { error: "Pick what kind it is" };
  if (!get("title")) return { error: "Say it in a few words" };
  const db = await requireDb("/app/me/about");
  await addSelfNote(db, { kind, title: get("title"), detail: get("detail") || null, workingOn: get("workingOn") || null });
  revalidatePath("/app/me/about");
  return { ok: true };
}

export async function resolveSelfNoteAction(id: string) {
  const db = await requireDb("/app/me/about");
  await updateSelfNote(db, id, { status: "resolved" });
  revalidatePath("/app/me/about");
}

export async function removeSelfNoteAction(id: string) {
  const db = await requireDb("/app/me/about");
  await updateSelfNote(db, id, { remove: true });
  revalidatePath("/app/me/about");
}
