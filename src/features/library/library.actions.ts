"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { formatFor, MEDIA_KINDS, MEDIA_STATUS, type MediaKind, type MediaStatus } from "./library";
import { editMedia, removeFavorite, removeMedia, saveFavorite, saveMedia } from "./library.repo";

export type LibraryFormState = null | { ok: true } | { error: string };
const PATH = "/app/me/library";

export async function saveMediaAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") as MediaKind;
  const status = get("status") as MediaStatus;
  if (!MEDIA_KINDS.includes(kind) || !get("title")) return { error: "Kind and title, please" };
  const db = await requireDb(PATH);
  await saveMedia(db, { kind, title: get("title"), creator: get("creator") || null, format: formatFor(kind, get("format")), status: MEDIA_STATUS.includes(status) ? status : "want" }, new Date());
  revalidatePath(PATH);
  return { ok: true };
}

/** Edit one library item from its row: any field, the title included. */
export async function editMediaAction(id: string, _prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") as MediaKind;
  const status = get("status") as MediaStatus;
  if (!MEDIA_KINDS.includes(kind) || !MEDIA_STATUS.includes(status) || !get("title")) return { error: "Kind, title and status, please" };
  const rating = get("rating") ? Number(get("rating")) : null;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { error: "Rating is 1 to 5 stars" };
  const db = await requireDb(PATH);
  const r = await editMedia(db, id, { kind, title: get("title"), creator: get("creator") || null, format: formatFor(kind, get("format")), status, rating, notes: get("notes") || null }, new Date());
  if (r.result === "not_found") return { error: "It's not in your library any more" };
  if (r.result === "exists") return { error: "You already have one with that title" };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setMediaStatusAction(kind: MediaKind, title: string, status: MediaStatus, rating?: number) {
  const db = await requireDb(PATH);
  await saveMedia(db, { kind, title, status, ...(rating ? { rating } : {}) }, new Date());
  revalidatePath(PATH);
}

export async function removeMediaAction(id: string) {
  const db = await requireDb(PATH);
  await removeMedia(db, id);
  revalidatePath(PATH);
}

export async function addFavoriteAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const category = String(form.get("category") ?? "").trim();
  const value = String(form.get("value") ?? "").trim();
  if (!category || !value) return { error: "What kind of favourite, and what is it?" };
  const db = await requireDb(PATH);
  const r = await saveFavorite(db, { category, value });
  if (r.result === "exists") return { error: "Already there" };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeFavoriteAction(id: string) {
  const db = await requireDb(PATH);
  await removeFavorite(db, { id });
  revalidatePath(PATH);
}
