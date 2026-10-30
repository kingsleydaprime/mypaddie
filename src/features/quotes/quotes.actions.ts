"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { parseQuote } from "./quotes";
import { addQuote, deleteQuote } from "./quotes.repo";

export async function addQuoteAction(form: FormData) {
  const db = await requireDb("/app/me/quotes");
  const quote = parseQuote(String(form.get("quote") ?? ""));
  if (quote) await addQuote(db, quote);
  revalidatePath("/app/me/quotes");
  revalidatePath("/app");
}

export async function deleteQuoteAction(id: string) {
  const db = await requireDb("/app/me/quotes");
  await deleteQuote(db, id);
  revalidatePath("/app/me/quotes");
  revalidatePath("/app");
}
