"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { createInvite, revokeInvite } from "./invites.repo";

export type InviteFormState = null | { code: string; email: string | null } | { error: string };

export async function createInviteAction(_prev: InviteFormState, form: FormData): Promise<InviteFormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right" };
  const db = await requireDb("/app/settings");
  const made = await createInvite(db, { email, note });
  if (made.result === "none_left") return { error: "You've no invites left. Revoke an unused one to free a slot." };
  revalidatePath("/app/settings");
  return { code: made.code, email };
}

export async function revokeInviteAction(id: string) {
  const db = await requireDb("/app/settings");
  await revokeInvite(db, id, new Date());
  revalidatePath("/app/settings");
}
