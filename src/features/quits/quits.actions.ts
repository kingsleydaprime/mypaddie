"use server";

import { revalidatePath } from "next/cache";
import { planErrorMessage } from "@/features/plans/action-error";
import { requireDb } from "@/shared/supabase/session";
import { QuitRuleError, type QuitKind, type QuitUnit } from "./quits";
import {
  deleteQuit,
  logQuit,
  setQuitCap,
  setQuitStatus,
  startQuit,
  updateQuitDetails,
  type QuitDetails,
  type QuitStatus,
} from "./quits.repo";

const PATH = "/app/quits";

export type QuitFormState = null | { error: string };

/** A rule or plan limit becomes the form's message; anything else is a real failure. */
function errorMessage(e: unknown): string {
  if (e instanceof QuitRuleError) return e.message;
  return planErrorMessage(e);
}

function refresh(id?: string) {
  revalidatePath(PATH);
  if (id) revalidatePath(`${PATH}/${id}`);
  revalidatePath("/app"); // the Home line, when it's on
}

export async function startQuitAction(_prev: QuitFormState, form: FormData): Promise<QuitFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") === "limit" ? "limit" : ("quit" as QuitKind);
  const limit = get("limit") ? Number(get("limit")) : null;
  const unit = (get("unit") || null) as QuitUnit | null;
  const db = await requireDb(PATH);
  try {
    const res = await startQuit(
      db,
      {
        title: get("title"),
        alias: get("alias") || null,
        kind,
        limitPerDay: limit,
        unit,
        why: get("why") || null,
        onHome: form.get("on_home") === "on",
        startedAt: get("started_at") ? new Date(get("started_at")) : null,
      },
      new Date(),
    );
    if (res.result === "already_tracking") return { error: "You're already tracking that." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  refresh();
  return null;
}

export async function logQuitAction(
  id: string,
  log: { at?: string | null; amount?: number | null; note?: string | null; cause?: string | null },
) {
  const db = await requireDb(`${PATH}/${id}`);
  try {
    const res = await logQuit(db, id, { ...log, at: log.at ? new Date(log.at) : null }, new Date());
    refresh(id);
    return res;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setQuitStatusAction(id: string, status: QuitStatus) {
  const db = await requireDb(`${PATH}/${id}`);
  try {
    const res = await setQuitStatus(db, id, status, new Date());
    refresh(id);
    return res;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setQuitCapAction(id: string, cap: number) {
  const db = await requireDb(`${PATH}/${id}`);
  try {
    const res = await setQuitCap(db, id, cap, new Date());
    refresh(id);
    return res;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateQuitAction(id: string, details: QuitDetails) {
  const db = await requireDb(`${PATH}/${id}`);
  try {
    const res = await updateQuitDetails(db, id, details);
    refresh(id);
    return res;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteQuitAction(id: string) {
  const db = await requireDb(PATH);
  const res = await deleteQuit(db, id);
  refresh();
  return res;
}
