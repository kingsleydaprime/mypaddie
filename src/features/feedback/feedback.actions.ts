"use server";

import { requireDb } from "@/shared/supabase/session";

export type FeedbackState = null | { ok: true } | { error: string };

/** Straight to the team (public.feedback): insert-only for users; read in the dashboard. */
export async function sendFeedbackAction(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const message = String(form.get("message") ?? "").trim();
  if (!message) return { error: "Write something first." };
  if (message.length > 4000) return { error: "Keep it under 4,000 characters." };
  const db = await requireDb("/app/settings");
  const { error } = await db.from("feedback").insert({ message, page: String(form.get("page") ?? "").slice(0, 200) || null });
  if (error) return { error: "Couldn't send it. Try again." };
  return { ok: true };
}
