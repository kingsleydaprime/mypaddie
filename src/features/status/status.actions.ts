"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { STATUS_KINDS } from "./status";
import { clearStatus, setStatus, untilFrom } from "./status.repo";

export async function setStatusAction(form: FormData) {
  const v = z.object({ kind: z.enum(STATUS_KINDS), until: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).safeParse(Object.fromEntries(form));
  if (!v.success) return;
  const now = new Date();
  const db = await requireDb("/app");
  const until = untilFrom({ until: v.data.until }, now);
  if (until) await setStatus(db, { kind: v.data.kind, until }, now);
  revalidatePath("/app");
}

export async function clearStatusAction() {
  await clearStatus(await requireDb("/app"), new Date());
  revalidatePath("/app");
}
