"use server";

import { redirect } from "next/navigation";
import { passwordProblem } from "@/features/auth/auth";
import { serverClient } from "@/shared/supabase/server";

export type ResetState = null | { error: string };

/** Reached signed in, through the reset link (/auth/confirm verified it). */
export async function setNewPassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const password = String(form.get("password") ?? "");
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const supabase = await serverClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?error=link");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/app");
}
