"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { disconnectApp } from "./connect.repo";

export async function disconnectAction(clientId: string) {
  const db = await requireDb("/app/settings");
  await disconnectApp(db, clientId);
  revalidatePath("/app/settings");
}
