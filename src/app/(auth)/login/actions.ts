"use server";

import { redirect } from "next/navigation";
import { captchaToken } from "@/features/auth/captcha";
import { isEmail } from "@/features/auth/auth";
import { safeNext } from "@/shared/safe-next";
import { siteOrigin } from "@/shared/site";
import { serverClient } from "@/shared/supabase/server";

export type LinkState = null | { sent: string } | { error: string };

const back = (next: string, error: string, message?: string) =>
  `/login?error=${error}&next=${encodeURIComponent(next)}${message ? `&message=${encodeURIComponent(message)}` : ""}`;

export async function signIn(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    options: { captchaToken: captchaToken(formData) },
  });
  // Same message for every failure: don't reveal whether the email exists.
  if (error) redirect(back(next, "credentials"));
  redirect(next);
}

/** Google: off to Google, back through /auth/callback. A new Google account must have been invited (the hook checks). */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(back(next, "oauth"));
  redirect(data.url);
}

/** A sign-in link for an existing account. Never creates one: that's what invites are for. */
export async function sendSignInLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { error: "Enter your email." };
  const supabase = await serverClient();
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`, captchaToken: captchaToken(formData) },
  });
  // Same answer whether or not the account exists.
  return { sent: email };
}

export async function sendPasswordReset(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { error: "Enter your email." };
  const supabase = await serverClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`, captchaToken: captchaToken(formData) });
  return { sent: email };
}
