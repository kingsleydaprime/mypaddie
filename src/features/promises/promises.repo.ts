import { completeTask, createTask, deleteTask, updateTask, type CompleteResult } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import {
  brokenPromiseDeduction,
  canRenegotiate,
  isBroken,
  PROMISE_BASE_XP,
  PROMISE_WEIGHTS,
  promisePatterns,
  type PromiseRecord,
  type PromiseStatus,
} from "./promises";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const COLUMNS = "id, person, what, made_at, due_at, status, kept_at, released_at, renegotiations, task_id, notes";
/** How far back broken promises are looked for (like ignored needs). */
const LOOKBACK_DAYS = 14;

type Row = {
  id: string; person: string; what: string; made_at: string; due_at: string | null; status: PromiseStatus;
  kept_at: string | null; released_at: string | null; renegotiations: number; task_id: string | null; notes: string | null;
};

const toRecord = (r: Row): PromiseRecord & { id: string; taskId: string | null; renegotiations: number; notes: string | null; madeAt: Date } => ({
  id: r.id,
  person: r.person,
  what: r.what,
  status: r.status,
  dueAt: r.due_at ? new Date(r.due_at) : null,
  keptAt: r.kept_at ? new Date(r.kept_at) : null,
  releasedAt: r.released_at ? new Date(r.released_at) : null,
  taskId: r.task_id,
  renegotiations: r.renegotiations,
  notes: r.notes,
  madeAt: new Date(r.made_at),
});
export type LoadedPromise = ReturnType<typeof toRecord>;

const taskTitle = (person: string, what: string) => `Promise to ${person.trim()}: ${what.trim()}`.slice(0, 200);
/** A promise is a must-do from the morning before it's due. */
const mustFromFor = (dueDay: string, now: Date) => {
  const day = addDays(dueDay, -1);
  const today = dayKey(now, tz());
  return zonedInstant(day < today ? today : day, "09:00", tz());
};

export interface NewPromise {
  person: string;
  what: string;
  /** Local date, and time if they said one. Omit for "sometime". */
  due?: { date: string; time?: string | null } | null;
  notes?: string | null;
}

/**
 * Records a promise and the task that keeps it on Today. A promise is already
 * made, so a full day doesn't stop it being recorded: the task goes on
 * without a date instead, and the full day is reported — a reason to
 * renegotiate or drop something, not to forget it.
 */
export async function addPromise(db: Db, input: NewPromise, now: Date) {
  const dueAt = input.due ? zonedInstant(input.due.date, input.due.time ?? "23:59", tz()) : null;
  const base = { title: taskTitle(input.person, input.what), itemId: null, baseXp: PROMISE_BASE_XP, recurrence: null, nonNegotiable: false, weights: PROMISE_WEIGHTS };
  let task = input.due
    ? await createTask(db, { ...base, dueDate: input.due.date, dueTime: input.due.time ?? null, mustFrom: mustFromFor(input.due.date, now) }, now)
    : await createTask(db, { ...base, dueDate: null, dueTime: null }, now);
  let dayFull = null;
  if (task.result !== "created") {
    dayFull = task;
    task = await createTask(db, { ...base, dueDate: null, dueTime: null, mustFrom: input.due ? mustFromFor(input.due.date, now) : null }, now);
  }
  const { data, error } = await db
    .from("promises")
    .insert({
      person: input.person.trim(),
      what: input.what.trim(),
      due_at: dueAt?.toISOString() ?? null,
      task_id: task.result === "created" ? task.task.id : null,
      notes: input.notes?.trim() || null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`saving the promise: ${error.message}`);
  return { promise: toRecord(data as Row), ...(dayFull ? { dayFull } : {}) };
}

export async function loadPromises(db: Db, opts: { includeSettled?: boolean } = {}) {
  let query = db.from("promises").select(COLUMNS).order("due_at", { ascending: true, nullsFirst: false });
  if (!opts.includeSettled) query = query.eq("status", "open");
  const { data, error } = await query;
  if (error) throw new Error(`loading promises: ${error.message}`);
  return (data as Row[]).map(toRecord);
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function findPromise(db: Db, ref: string) {
  if (!isUuid(ref)) return null;
  const { data, error } = await db.from("promises").select(COLUMNS).eq("id", ref).maybeSingle();
  if (error) throw new Error(`finding the promise: ${error.message}`);
  return data ? toRecord(data as Row) : null;
}

/** Kept: completes its task (paying XP — reduced if late), which marks the promise kept. */
export async function keepPromise(db: Db, id: string, now: Date): Promise<{ result: "kept" | "not_found" | "not_open"; completed?: CompleteResult; wasBroken?: boolean }> {
  const p = await findPromise(db, id);
  if (!p) return { result: "not_found" };
  if (p.status !== "open" && p.status !== "broken") return { result: "not_open" };
  const completed = p.taskId ? await completeTask(db, p.taskId, now) : undefined;
  // No task (or it was already done): record it directly.
  await db.from("promises").update(p.status === "open" ? { status: "kept", kept_at: now.toISOString() } : { kept_at: now.toISOString() }).eq("id", p.id).is("kept_at", null);
  return { result: "kept", ...(completed ? { completed } : {}), wasBroken: p.status === "broken" || isBroken({ ...p, keptAt: now }, now) };
}

/** They let him off it. In time, it's not broken; its task is cancelled without penalty. */
export async function releasePromise(db: Db, id: string, now: Date) {
  const p = await findPromise(db, id);
  if (!p) return { result: "not_found" as const };
  if (p.status !== "open") return { result: "not_open" as const, status: p.status };
  await db.from("promises").update({ status: "released", released_at: now.toISOString() }).eq("id", p.id);
  if (p.taskId) await updateTask(db, p.taskId, {}, "cancel", now);
  return { result: "released" as const, inTime: !isBroken({ ...p, releasedAt: now }, now) };
}

/**
 * A new date, agreed with them before the old one passed. After its day has
 * ended it's too late: the promise is broken (it can still be kept late).
 */
export async function renegotiatePromise(db: Db, id: string, due: { date: string; time?: string | null }, now: Date) {
  const p = await findPromise(db, id);
  if (!p) return { result: "not_found" as const };
  if (!canRenegotiate(p, now)) return { result: "too_late" as const, status: p.status };
  if (due.date < dayKey(now, tz())) return { result: "date_in_past" as const };
  if (p.taskId) {
    const moved = await updateTask(db, p.taskId, { dueDate: due.date, dueTime: due.time ?? null, mustFrom: mustFromFor(due.date, now) }, "edit", now);
    if (moved.result !== "updated") return { result: "task_not_moved" as const, detail: moved };
  }
  const dueAt = zonedInstant(due.date, due.time ?? "23:59", tz());
  await db.from("promises").update({ due_at: dueAt.toISOString(), renegotiations: p.renegotiations + 1 }).eq("id", p.id);
  return { result: "renegotiated" as const, due: dueAt.toISOString(), times: p.renegotiations + 1 };
}

export async function editPromise(db: Db, id: string, changes: { person?: string; what?: string; notes?: string | null }) {
  const p = await findPromise(db, id);
  if (!p) return { result: "not_found" as const };
  const person = changes.person?.trim() || p.person;
  const what = changes.what?.trim() || p.what;
  await db.from("promises").update({ person, what, ...(changes.notes !== undefined ? { notes: changes.notes?.trim() || null } : {}) }).eq("id", p.id);
  if (p.taskId && (changes.person || changes.what)) await updateTask(db, p.taskId, { title: taskTitle(person, what) }, "edit");
  return { result: "updated" as const };
}

/** Logged by mistake: gone, with its task — only while nothing was paid or deducted. */
export async function removePromise(db: Db, id: string) {
  const p = await findPromise(db, id);
  if (!p) return { result: "not_found" as const };
  if (p.taskId) {
    const d = await deleteTask(db, p.taskId);
    if (d.result === "has_history") return { result: "has_history" as const };
  }
  await db.from("promises").delete().eq("id", p.id);
  return { result: "removed" as const };
}

/**
 * Applies broken-promise deductions (once each: the ledger refuses a repeat)
 * and marks them broken. Run before showing Today, like the ignored-need
 * catch-up.
 */
export async function applyBrokenPromises(db: Db, now: Date): Promise<number> {
  const todayStart = zonedInstant(dayKey(now, tz()), "00:00", tz());
  const since = new Date(todayStart.getTime() - LOOKBACK_DAYS * 86_400_000);
  const { data, error } = await db
    .from("promises")
    .select(COLUMNS)
    .in("status", ["open", "kept", "broken"])
    .not("task_id", "is", null)
    .gte("due_at", since.toISOString())
    .lt("due_at", todayStart.toISOString());
  if (error) throw new Error(`loading promises: ${error.message}`);
  const broken = (data as Row[]).map(toRecord).filter((p) => isBroken(p, now));
  if (broken.length === 0) return 0;
  const entries = broken.flatMap((p) => brokenPromiseDeduction(p, now).map((e) => ({ ...e, task_id: p.taskId })));
  const { data: inserted, error: awardError } = await db.rpc("award_xp", { p_entries: entries as unknown as Json });
  if (awardError) throw new Error(`recording broken promises: ${awardError.message}`);
  const open = broken.filter((p) => p.status === "open").map((p) => p.id);
  if (open.length) await db.from("promises").update({ status: "broken" }).in("id", open);
  return inserted;
}

/** Open promises (soonest first), recent history, and people he keeps letting down. */
export async function loadPromisePicture(db: Db, now: Date) {
  const all = await loadPromises(db, { includeSettled: true });
  const today = dayKey(now, tz());
  const open = all.filter((p) => p.status === "open");
  return {
    open: open.map((p) => ({
      ...p,
      daysLeft: p.dueAt ? Math.round((Date.parse(`${dayKey(p.dueAt, tz())}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null,
    })),
    recent: all.filter((p) => p.status !== "open").sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0)).slice(0, 20),
    patterns: promisePatterns(all, now),
  };
}
