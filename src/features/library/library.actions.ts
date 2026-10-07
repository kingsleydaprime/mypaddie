"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { MEDIA_KINDS, MEDIA_STATUS, type MediaKind, type MediaStatus } from "./library";
import { removeFavorite, removeMedia, saveFavorite, saveMedia } from "./library.repo";

export type LibraryFormState = null | { ok: true } | { error: string };
const PATH = "/app/me/library";

export async function saveMediaAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") as MediaKind;
  const status = get("status") as MediaStatus;
  if (!MEDIA_KINDS.includes(kind) || !get("title")) return { error: "Kind and title, please" };
  const db = await requireDb(PATH);
  await saveMedia(db, { kind, title: get("title"), creator: get("creator") || null, status: MEDIA_STATUS.includes(status) ? status : "want" }, new Date());
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
