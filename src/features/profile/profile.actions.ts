"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { VOICES, type ProfileChange, type Voice } from "./profile";
import { completeOnboarding, updateProfile } from "./profile.repo";

export type ProfileFormState = null | { ok: true } | { error: string };

function readForm(form: FormData): ProfileChange {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const voice = get("voice") as Voice;
  return {
    displayName: get("displayName") || null,
    timeZone: get("timeZone"),
    currency: get("currency").toUpperCase(),
    voice: VOICES.includes(voice) ? voice : "naija",
  };
}

export async function saveProfileAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const db = await requireDb("/app/settings");
  const result = await updateProfile(db, readForm(form));
  if (!result.ok) return { error: result.error };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function finishOnboardingAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const db = await requireDb("/welcome");
  const result = await completeOnboarding(db, readForm(form), new Date());
  if (!result.ok) return { error: result.error };
  redirect("/app");
}
