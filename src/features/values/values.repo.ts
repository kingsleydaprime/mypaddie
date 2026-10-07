import type { Db } from "@/shared/supabase/token-client";

export async function loadValues(db: Db) {
  const { data, error } = await db.from("life_values").select("id, value, why, position").order("position");
  if (error) throw new Error(`loading values: ${error.message}`);
  return data;
}

/** Replace the whole list, in order — values are a small set, edited together. */
export async function setValues(db: Db, values: { value: string; why?: string | null }[]) {
  const clean = values.map((v) => ({ value: v.value.trim(), why: v.why?.trim() || null })).filter((v) => v.value);
  const seen = new Set<string>();
  const unique = clean.filter((v) => !seen.has(v.value.toLowerCase()) && seen.add(v.value.toLowerCase()));
  const { error: delError } = await db.from("life_values").delete().not("id", "is", null);
  if (delError) throw new Error(`saving values: ${delError.message}`);
  if (unique.length) {
    const { error } = await db.from("life_values").insert(unique.map((v, i) => ({ ...v, position: i })));
    if (error) throw new Error(`saving values: ${error.message}`);
  }
  return { result: "saved" as const, count: unique.length };
}
