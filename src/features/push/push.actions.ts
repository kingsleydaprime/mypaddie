"use server";

import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";

const subscription = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Saves this device's push address under the signed-in user (RLS). */
export async function saveSubscription(raw: unknown) {
  const sub = subscription.parse(raw);
  const db = await requireDb("/app/settings");
  const { error } = await db
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) throw new Error(`saving the subscription: ${error.message}`);
}

export async function removeSubscription(endpoint: string) {
  const db = await requireDb("/app/settings");
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(`removing the subscription: ${error.message}`);
}
