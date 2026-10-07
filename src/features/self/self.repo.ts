import type { Db } from "@/shared/supabase/token-client";
import { ADVICE_KINDS, type SelfKind } from "./self";

const COLUMNS = "id, kind, title, detail, working_on, status, since, updated_at";
export interface SelfNote {
  id: string;
  kind: SelfKind;
  title: string;
  detail: string | null;
  working_on: string | null;
  status: "active" | "resolved";
  since: string | null;
  updated_at: string;
}

export async function loadSelf(db: Db, opts: { includeResolved?: boolean } = {}): Promise<SelfNote[]> {
  let q = db.from("self_notes").select(COLUMNS).order("updated_at", { ascending: false });
  if (!opts.includeResolved) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(`loading self notes: ${error.message}`);
  return data as SelfNote[];
}

/** The short version for every chat: active patterns, triggers, weak spots, habits to break, healing. */
export async function loadSelfForAdvice(db: Db) {
  const { data } = await db.from("self_notes").select("kind, title, working_on").eq("status", "active").in("kind", [...ADVICE_KINDS]).order("updated_at", { ascending: false }).limit(15);
  return (data ?? []).map((n) => ({ kind: n.kind as SelfKind, title: n.title, ...(n.working_on ? { workingOn: n.working_on } : {}) }));
}

export interface SelfInput {
  kind: SelfKind;
  title: string;
  detail?: string | null;
  workingOn?: string | null;
  since?: string | null;
}

export async function addSelfNote(db: Db, input: SelfInput) {
  const { data, error } = await db
    .from("self_notes")
    .insert({ kind: input.kind, title: input.title.trim(), detail: input.detail?.trim() || null, working_on: input.workingOn?.trim() || null, since: input.since ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`saving: ${error.message}`);
  return { result: "added" as const, id: data.id };
}

export async function updateSelfNote(db: Db, id: string, changes: Partial<SelfInput> & { status?: "active" | "resolved"; remove?: boolean }) {
  if (changes.remove) {
    await db.from("self_notes").delete().eq("id", id);
    return { result: "removed" as const };
  }
  const { data, error } = await db
    .from("self_notes")
    .update({
      ...(changes.kind ? { kind: changes.kind } : {}),
      ...(changes.title ? { title: changes.title.trim() } : {}),
      ...(changes.detail !== undefined ? { detail: changes.detail?.trim() || null } : {}),
      ...(changes.workingOn !== undefined ? { working_on: changes.workingOn?.trim() || null } : {}),
      ...(changes.since !== undefined ? { since: changes.since } : {}),
      ...(changes.status ? { status: changes.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`updating: ${error.message}`);
  return { result: data ? ("updated" as const) : ("not_found" as const) };
}
