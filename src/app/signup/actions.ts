"use server";

import { redirect } from "next/navigation";
import { CLAIM_MESSAGES, isEmail, normalizeCode, passwordProblem } from "@/features/auth/auth";
import { siteOrigin } from "@/shared/site";
import { serverClient } from "@/shared/supabase/server";

export type SignUpState = null | { error: string } | { checkEmail: string; why: "link" | "confirm" };

/**
 * One form, three ways in. The invite is checked (and an open code tied to this
 * email) before anything else, so mistakes are explained here rather than as
 * a refusal from Google. The sign-up hook checks again — this page is a
 * convenience, not the gate.
 */
export async function signUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const code = normalizeCode(String(form.get("invite") ?? ""));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const method = String(form.get("method") ?? "");
  if (code.length !== 8) return { error: "Enter your 8-character invite code." };
  if (!isEmail(email)) return { error: "Enter your email." };

  const supabase = await serverClient();
  const { data: claim, error: claimError } = await supabase.rpc("claim_invite", { p_code: code, p_email: email });
  if (claimError) return { error: "Couldn't check the invite. Try again." };
  if (claim !== "ok") return { error: CLAIM_MESSAGES[claim] ?? "That invite can't be used." };

  const origin = await siteOrigin();
  const confirm = `${origin}/auth/confirm?next=${encodeURIComponent("/app")}`;
  const meta = { invite_code: code };

  if (method === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // login_hint pre-selects the invited account in Google's chooser.
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/app")}`, queryParams: { login_hint: email } },
    });
    if (error || !data.url) return { error: "Couldn't reach Google. Try again, or use an email link." };
    redirect(data.url);
  }

  if (method === "link") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: meta, emailRedirectTo: confirm } });
    if (error) return { error: error.message };
    return { checkEmail: email, why: "link" };
  }

  const password = String(form.get("password") ?? "");
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: confirm } });
  if (error) return { error: error.message };
  // With email confirmation on, there's no session until they click the link.
  if (!data.session) return { checkEmail: email, why: "confirm" };
  redirect("/app");
}
