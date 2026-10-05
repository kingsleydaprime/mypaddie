"use server";

import { revalidatePath } from "next/cache";
import { refusalMessage } from "@/features/tasks/ui/refusal";
import { requireDb } from "@/shared/supabase/session";
import { CHANNELS, type Channel } from "./updates";
import { addUpdate, markUpdateSent } from "./updates.repo";

export type UpdateFormState = null | { error: string } | { ok: string };

export async function addUpdateAction(_prev: UpdateFormState, form: FormData): Promise<UpdateFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const recipient = get("recipient");
  const about = get("about");
  const channel = get("channel") as Channel;
  const weekday = get("weekday");
  if (!recipient || !about) return { error: "Who is it for, and what's it about?" };
  if (!CHANNELS.includes(channel)) return { error: "Pick a channel" };
  const db = await requireDb("/app/updates");
  const result = await addUpdate(
    db,
    {
      recipient,
      channel,
      about,
      format: get("format") || undefined,
      recurrence: weekday ? `FREQ=WEEKLY;BYDAY=${weekday}` : undefined,
      dueDate: weekday ? undefined : get("date") || undefined,
      dueTime: get("time") || undefined,
    },
    new Date(),
  );
  if (result.result === "clash" || result.result === "over_capacity") return { error: refusalMessage(result) };
  revalidatePath("/app/updates");
  return { ok: "Added — it's on your days now." };
}

export async function markSentAction(id: string) {
  const db = await requireDb("/app/updates");
  await markUpdateSent(db, id, null, new Date());
  revalidatePath("/app/updates");
  revalidatePath("/app");
}
