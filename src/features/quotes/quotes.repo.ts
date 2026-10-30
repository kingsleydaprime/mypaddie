import type { Db } from "@/shared/supabase/token-client";
import { BUILT_IN_QUOTES, quoteOfTheDay } from "./quotes";

export async function loadQuotes(db: Db) {
  const { data, error } = await db.from("quotes").select("id, text, author, created_at").order("created_at");
  if (error) throw new Error(`loading quotes: ${error.message}`);
  return data;
}

/** Today's quote for Home and get_today: theirs most days, a built-in one otherwise. */
export async function loadQuoteOfTheDay(db: Db, day: string) {
  const own = await loadQuotes(db);
  return quoteOfTheDay(own.map((q) => ({ text: q.text, author: q.author })), day, BUILT_IN_QUOTES);
}

export async function addQuote(db: Db, quote: { text: string; author?: string | null }) {
  const text = quote.text.trim();
  const author = quote.author?.trim() || null;
  const { data, error } = await db.from("quotes").insert({ text, author }).select("id").single();
  // 23505: the unique index on (user, lower(trim(text))).
  if (error?.code === "23505") return { result: "already_saved" as const };
  if (error) throw new Error(`saving the quote: ${error.message}`);
  return { result: "saved" as const, id: data.id };
}

export async function deleteQuote(db: Db, id: string) {
  const { data, error } = await db.from("quotes").delete().eq("id", id).select("id");
  if (error) throw new Error(`deleting the quote: ${error.message}`);
  return { result: data.length ? ("deleted" as const) : ("not_found" as const) };
}
