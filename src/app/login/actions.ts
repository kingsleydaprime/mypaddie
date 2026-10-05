"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/shared/safe-next";
import { serverClient } from "@/shared/supabase/server";

export async function signIn(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) {
    // Same message for every failure: don't reveal whether the email exists.
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
