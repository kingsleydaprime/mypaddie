"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { parseValues } from "./values";
import { setValues } from "./values.repo";

export async function setValuesAction(form: FormData) {
  const db = await requireDb("/app/me/values");
  await setValues(db, parseValues(String(form.get("values") ?? "")).slice(0, 15));
  revalidatePath("/app/me/values");
}
