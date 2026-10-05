"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { activateIdentity, saveIdentityVersion, updateIdentity } from "./identity.repo";

export type ProfileState = null | { error: string } | { ok: string };

/** Save edits in place, or (mode=new) as a separate version that becomes active. */
export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const name = String(form.get("name") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();
  const id = String(form.get("id") ?? "");
  if (!name || !text) return { error: "Give it a name and write it out." };
  const db = await requireDb("/app/settings");
  if (form.get("mode") === "new" || !id) {
    await saveIdentityVersion(db, name, text, true);
  } else {
    const r = await updateIdentity(db, { id, name, text });
    if (r.result !== "updated") return { error: "Couldn't find that version." };
  }
  revalidatePath("/app/settings");
  return { ok: form.get("mode") === "new" || !id ? "Saved as a new version — now active." : "Saved." };
}

export async function switchProfileAction(id: string) {
  const db = await requireDb("/app/settings");
  await activateIdentity(db, id);
  revalidatePath("/app/settings");
}
