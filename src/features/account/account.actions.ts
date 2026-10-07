"use server";

import { redirect } from "next/navigation";
import { serverClient } from "@/shared/supabase/server";

export type DeleteState = null | { error: string };

const CONFIRM_PHRASE = "delete my account";

/** Gone for good: the account and everything in it (cascades), then signed out. */
export async function deleteAccountAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== CONFIRM_PHRASE) {
    return { error: `Type "${CONFIRM_PHRASE}" to confirm.` };
  }
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "Couldn't delete the account. Try again, or contact us." };
  await supabase.auth.signOut().catch(() => null);
  redirect("/?deleted=1");
}
