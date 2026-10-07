import type { Db } from "@/shared/supabase/token-client";
import { normalizeCategory, type MediaKind, type MediaStatus } from "./library";

const MEDIA = "id, kind, title, creator, status, rating, notes, started_on, finished_on, created_at";

export async function loadMedia(db: Db, opts: { kind?: MediaKind; status?: MediaStatus } = {}) {
  let q = db.from("media").select(MEDIA).order("created_at", { ascending: false });
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`loading the library: ${error.message}`);
  return data;
}

export interface MediaInput {
  kind: MediaKind;
  title: string;
  creator?: string | null;
  status?: MediaStatus;
  rating?: number | null;
  notes?: string | null;
}

/**
 * Adds or updates by kind + title. Moving to "in progress" stamps when it
 * started; "done" stamps when it finished.
 */
export async function saveMedia(db: Db, input: MediaInput, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const { data: existing } = await db.from("media").select("id, status, started_on").eq("kind", input.kind).ilike("title", input.title.trim().replace(/[%_\\]/g, "\\$&")).maybeSingle();
  const status = input.status ?? (existing?.status as MediaStatus | undefined) ?? "want";
  const patch = {
    kind: input.kind,
    title: input.title.trim(),
    ...(input.creator !== undefined ? { creator: input.creator?.trim() || null } : {}),
    status,
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    ...(status === "in_progress" && !existing?.started_on ? { started_on: today } : {}),
    ...(status === "done" ? { finished_on: today } : {}),
  };
  if (existing) {
    const { error } = await db.from("media").update(patch).eq("id", existing.id);
    if (error) throw new Error(`updating: ${error.message}`);
    return { result: "updated" as const, title: patch.title, status };
  }
  const { error } = await db.from("media").insert(patch);
  if (error) throw new Error(`saving: ${error.message}`);
  return { result: "added" as const, title: patch.title, status };
}

export async function removeMedia(db: Db, id: string) {
  await db.from("media").delete().eq("id", id);
}

export async function loadFavorites(db: Db) {
  const { data, error } = await db.from("favorites").select("id, category, value, note").order("category").order("created_at");
  if (error) throw new Error(`loading favourites: ${error.message}`);
  return data;
}

export async function saveFavorite(db: Db, input: { category: string; value: string; note?: string | null }) {
  const { error } = await db.from("favorites").insert({ category: normalizeCategory(input.category), value: input.value.trim(), note: input.note?.trim() || null });
  if (error?.code === "23505") return { result: "exists" as const };
  if (error) throw new Error(`saving the favourite: ${error.message}`);
  return { result: "added" as const, category: normalizeCategory(input.category) };
}

export async function removeFavorite(db: Db, ref: { id?: string; category?: string; value?: string }) {
  let q = db.from("favorites").delete();
  q = ref.id ? q.eq("id", ref.id) : q.eq("category", normalizeCategory(ref.category ?? "")).ilike("value", (ref.value ?? "").trim());
  const { error } = await q;
  if (error) throw new Error(`removing: ${error.message}`);
  return { result: "removed" as const };
}
