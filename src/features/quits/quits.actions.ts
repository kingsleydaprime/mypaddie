"use server";

import { revalidatePath } from "next/cache";
import { planErrorMessage } from "@/features/plans/action-error";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { dayKey, zonedInstant } from "@/shared/time";
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

export type QuitFormState = null | { error: string } | { ok: true; id: string };

/** A rule or plan limit becomes the form's message; anything else is a real failure. */
function errorMessage(e: unknown): string {
  if (e instanceof QuitRuleError) return e.message;
  return planErrorMessage(e);
}

/**
 * A date ("2026-11-05") or date and time ("2026-11-05T22:30") from a form, read
 * in the profile's time zone, not the server's. Null when empty, undefined when
 * it isn't one.
 */
function localInput(value: string | null | undefined): Date | null | undefined {
  const v = value?.trim() ?? "";
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(v);
  return m ? zonedInstant(m[1]!, m[2] ?? "00:00", currentConfig().timeZone) : undefined;
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
    // A start date of today means from now, not from the midnight before it was set up.
    const startedAt = get("started_at") === dayKey(new Date(), currentConfig().timeZone) ? null : localInput(get("started_at"));
    if (startedAt === undefined) return { error: "That start date doesn't look right." };
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
        startedAt,
      },
      new Date(),
    );
    if (res.result === "already_tracking") return { error: "You're already tracking that." };
    refresh();
    return { ok: true, id: res.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function logQuitAction(
  id: string,
  log: { at?: string | null; amount?: number | null; note?: string | null; cause?: string | null },
) {
  const db = await requireDb(`${PATH}/${id}`);
  try {
    const at = localInput(log.at);
    if (at === undefined) return { error: "That time doesn't look right." };
    const res = await logQuit(db, id, { ...log, at }, new Date());
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
  try {
    const res = await deleteQuit(db, id);
    refresh();
    return res;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
