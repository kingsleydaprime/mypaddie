import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { applyProfileChange, readProfile, type Profile, type ProfileChange } from "./profile";

const KEY = "profile";

export async function loadProfile(db: Db): Promise<Profile> {
  const { data, error } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw new Error(`loading the profile: ${error.message}`);
  return readProfile(data?.value);
}

async function save(db: Db, profile: Profile) {
  const { error } = await db.from("settings").upsert({ key: KEY, value: profile as unknown as { [key: string]: Json } }, { onConflict: "user_id,key" });
  if (error) throw new Error(`saving the profile: ${error.message}`);
}

export async function updateProfile(db: Db, change: ProfileChange) {
  const result = applyProfileChange(await loadProfile(db), change);
  if (result.ok) await save(db, result.profile);
  return result;
}

/** Onboarding done: the profile is set and the app opens normally from now on. */
export async function completeOnboarding(db: Db, change: ProfileChange, now: Date) {
  const result = applyProfileChange(await loadProfile(db), change);
  if (!result.ok) return result;
  const profile = { ...result.profile, onboardedAt: result.profile.onboardedAt ?? now.toISOString() };
  await save(db, profile);
  return { ok: true as const, profile };
}
