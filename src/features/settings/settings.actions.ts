"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { updateSchedule } from "./settings.repo";

export type SettingsState = null | { ok: true } | { error: string };

export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const get = (k: string) => String(form.get(k) ?? "");
  const db = await requireDb("/app/settings");
  const result = await updateSchedule(db, {
    quietStart: get("quietStart"),
    quietEnd: get("quietEnd"),
    briefAt: get("briefAt"),
    eveningAt: get("eveningAt"),
    morningAt: get("morningAt"),
    eventCloseDays: Number(get("eventCloseDays")),
    funEveryDays: Number(get("funEveryDays")),
    funAt: get("funAt"),
    closeOut: form.get("closeOut") === "on",
    closeAt: get("closeAt"),
    phoneFreeMorning: Number(get("phoneFreeMorning")),
    phoneFreeEvening: Number(get("phoneFreeEvening")),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/app/settings");
  return { ok: true };
}
