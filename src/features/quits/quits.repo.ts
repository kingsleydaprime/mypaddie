import { requireRoom } from "@/features/plans/guard";
import { currentConfig } from "@/shared/config";
import type { Json, TablesUpdate } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, zonedInstant } from "@/shared/time";
import {
  honestyDue,
  honestyXp,
  inRoughPatch,
  milestonePayouts,
  nextMilestone,
  privateLabel,
  quitProgress,
  quitTimeline,
  QuitRuleError,
  validateLog,
  validateSetup,
  type QuitKind,
  type QuitLog,
  type QuitPeriod,
  type QuitProgress,
  type QuitUnit,
} from "./quits";

/*
 * Privacy: titles and notes never go into error messages or logs. Errors say
 * "the quit", and XP rows link by id with no note.
 */

export type QuitStatus = "active" | "paused" | "ended";

export interface Quit {
  id: string;
  title: string;
  alias: string | null;
  kind: QuitKind;
  unit: QuitUnit | null;
  limitPerDay: number | null;
  status: QuitStatus;
  why: string | null;
  onHome: boolean;
  showNameToAi: boolean;
  createdAt: Date;
  progress: QuitProgress;
  nextMilestone: { days: number; daysLeft: number } | null;
}

const QUIT_COLUMNS = "id, title, alias, kind, unit, limit_per_day, status, why, on_home, show_name_to_ai, created_at";

interface QuitData {
  rows: {
    id: string;
    title: string;
    alias: string | null;
    kind: QuitKind;
    unit: QuitUnit | null;
    limit_per_day: number | null;
    status: QuitStatus;
    why: string | null;
    on_home: boolean;
    show_name_to_ai: boolean;
    created_at: string;
  }[];
  periods: Map<string, QuitPeriod[]>;
  logs: Map<string, QuitLog[]>;
}

function group<T>(rows: readonly { quit_id: string }[], map: (r: never) => T): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.quit_id) ?? [];
    list.push(map(r as never));
    out.set(r.quit_id, list);
  }
  return out;
}

/**
 * Quits with their periods and logs. `since` limits logs (and periods) to
 * recent ones, for the mode; `onHome` reads only active quits shown on Home.
 */
async function loadQuitData(
  db: Db,
  opts: { id?: string; since?: Date; activeOnly?: boolean; onHome?: boolean } = {},
): Promise<QuitData> {
  let quits = db.from("quits").select(QUIT_COLUMNS).order("created_at");
  if (opts.id) quits = quits.eq("id", opts.id);
  if (opts.activeOnly || opts.onHome) quits = quits.eq("status", "active");
  if (opts.onHome) quits = quits.eq("on_home", true);
  let periods = db.from("quit_periods").select("quit_id, started_at, ended_at, limit_per_day, continues_run").order("started_at");
  let logs = db.from("quit_logs").select("quit_id, at, amount").order("at");
  if (opts.id) {
    periods = periods.eq("quit_id", opts.id);
    logs = logs.eq("quit_id", opts.id);
  }
  if (opts.since) {
    periods = periods.or(`ended_at.is.null,ended_at.gte.${opts.since.toISOString()}`);
    logs = logs.gte("at", opts.since.toISOString());
  }

  let q, p, l;
  if (opts.onHome) {
    // Home asks on every load and most people have none on it: read the quits first, the rest only if needed.
    q = await quits;
    if (q.error) throw new Error(`loading quits: ${q.error.message}`);
    const ids = q.data.map((r) => r.id);
    if (!ids.length) return { rows: [], periods: new Map(), logs: new Map() };
    [p, l] = await Promise.all([periods.in("quit_id", ids), logs.in("quit_id", ids)]);
  } else {
    [q, p, l] = await Promise.all([quits, periods, logs]);
  }
  for (const res of [q, p, l]) if (res.error) throw new Error(`loading quits: ${res.error.message}`);
  return {
    rows: (q.data ?? []) as QuitData["rows"],
    periods: group(p.data ?? [], (r: { started_at: string; ended_at: string | null; limit_per_day: number | null; continues_run: boolean }) => ({
      startedAt: new Date(r.started_at),
      endedAt: r.ended_at ? new Date(r.ended_at) : null,
      limitPerDay: r.limit_per_day,
      continuesRun: r.continues_run,
    })),
    logs: group(l.data ?? [], (r: { at: string; amount: number | null }) => ({ at: new Date(r.at), amount: r.amount })),
  };
}

function toQuit(row: QuitData["rows"][number], data: QuitData, now: Date, timeZone: string): Quit {
  const progress = quitProgress(row.kind, data.periods.get(row.id) ?? [], data.logs.get(row.id) ?? [], now, timeZone);
  return {
    id: row.id,
    title: row.title,
    alias: row.alias,
    kind: row.kind,
    unit: row.unit,
    limitPerDay: row.limit_per_day,
    status: row.status,
    why: row.why,
    onHome: row.on_home,
    showNameToAi: row.show_name_to_ai,
    createdAt: new Date(row.created_at),
    progress,
    nextMilestone: row.status === "active" ? nextMilestone(progress.currentDays) : null,
  };
}

/**
 * Pays any milestone the current run has crossed and not been paid for. Paid
 * when noticed (milestones are crossed by time passing, not by an action), and
 * at most once per run: the database refuses a repeat.
 */
async function settleMilestones(db: Db, quit: Quit): Promise<number[]> {
  const run = quit.progress.runStartedAt;
  if (quit.status !== "active" || !run || quit.progress.currentDays < 1) return [];
  const { data: paidRows, error } = await db
    .from("quit_milestones")
    .select("days")
    .eq("quit_id", quit.id)
    .eq("run_started_at", run.toISOString());
  if (error) throw new Error(`loading milestones: ${error.message}`);
  const due = milestonePayouts(quit.progress.currentDays, (paidRows ?? []).map((r) => r.days));
  if (!due.length) return [];
  const { data, error: payError } = await db.rpc("pay_quit_milestones", {
    p_id: quit.id,
    p_run_started_at: run.toISOString(),
    p_milestones: due as unknown as Json,
  });
  if (payError) throw new Error(`paying milestones: ${payError.message}`);
  return data ?? [];
}

/**
 * Every quit (or one) with its progress. Pays milestones crossed since last
 * looked; `milestonesPaid` lists them so the app or Paddie can celebrate.
 */
export async function loadQuits(db: Db, now: Date, opts: { id?: string; onHome?: boolean } = {}) {
  const tz = currentConfig().timeZone;
  const data = await loadQuitData(db, opts);
  const quits = data.rows.map((r) => toQuit(r, data, now, tz));
  const paid = await Promise.all(quits.map((q) => settleMilestones(db, q)));
  return quits.map((quit, i) => ({ quit, milestonesPaid: paid[i]! }));
}

export async function loadQuit(db: Db, id: string, now: Date) {
  return (await loadQuits(db, now, { id }))[0] ?? null;
}

/** One quit's history for its page, newest first, with notes. Only the owner ever sees this. */
export async function loadQuitHistory(db: Db, id: string, kind: QuitKind) {
  const tz = currentConfig().timeZone;
  const [p, l] = await Promise.all([
    db.from("quit_periods").select("started_at, ended_at, limit_per_day, continues_run").eq("quit_id", id).order("started_at"),
    db.from("quit_logs").select("id, at, amount, note, cause").eq("quit_id", id).order("at", { ascending: false }).limit(HISTORY_LIMIT),
  ]);
  for (const res of [p, l]) if (res.error) throw new Error(`loading the quit's history: ${res.error.message}`);
  const periods: QuitPeriod[] = (p.data ?? []).map((r) => ({
    startedAt: new Date(r.started_at),
    endedAt: r.ended_at ? new Date(r.ended_at) : null,
    limitPerDay: r.limit_per_day,
    continuesRun: r.continues_run,
  }));
  const logs = (l.data ?? []).map((r) => ({ id: r.id, at: new Date(r.at), amount: r.amount, note: r.note, cause: r.cause }));
  return { entries: quitTimeline(kind, periods, logs, tz), capped: logs.length === HISTORY_LIMIT };
}

const HISTORY_LIMIT = 200;

/** Private labels of active quits in a rough patch, for the mode. Reads only the last few days. */
export async function loadRoughPatches(db: Db, now: Date, tz = currentConfig().timeZone): Promise<string[]> {
  const since = zonedInstant(dayKey(new Date(now.getTime() - 3 * 86_400_000), tz), "00:00", tz);
  const data = await loadQuitData(db, { since, activeOnly: true });
  return data.rows
    .filter((r) => inRoughPatch(r.kind, data.periods.get(r.id) ?? [], data.logs.get(r.id) ?? [], now, tz))
    .map((r) => privateLabel(r));
}

/** The table's length checks, as messages instead of a failed insert. */
function checkLengths(q: { title?: string; alias?: string | null; why?: string | null }) {
  if (q.title !== undefined && q.title.trim().length > 80) throw new QuitRuleError("Keep the name to 80 characters.");
  if (q.alias && q.alias.trim().length > 40) throw new QuitRuleError("Keep the private name to 40 characters.");
  if (q.why && q.why.trim().length > 300) throw new QuitRuleError("Keep the why to 300 characters.");
}

export interface NewQuit {
  title: string;
  alias?: string | null;
  kind: QuitKind;
  limitPerDay?: number | null;
  unit?: QuitUnit | null;
  why?: string | null;
  onHome?: boolean;
  /** Defaults to now. Can be earlier ("I stopped on Monday"), never later. */
  startedAt?: Date | null;
}

export async function startQuit(db: Db, quit: NewQuit, now: Date) {
  const title = quit.title.trim();
  if (!title) throw new QuitRuleError("Name the habit.");
  checkLengths(quit);
  const limit = quit.kind === "limit" ? (quit.limitPerDay ?? null) : null;
  const unit = quit.kind === "limit" ? (quit.unit ?? null) : null;
  validateSetup(quit.kind, limit, unit);
  const startedAt = quit.startedAt ?? now;
  if (startedAt.getTime() > now.getTime()) throw new QuitRuleError("The start can't be in the future.");
  await requireRoom(db, "quits");

  // Generated RPC types mark every argument non-null; the SQL accepts null for the optional ones.
  const { data, error } = await db.rpc("start_quit", {
    p_title: title,
    p_alias: (quit.alias?.trim() || null) as string,
    p_kind: quit.kind,
    p_limit: limit as number,
    p_unit: unit as QuitUnit,
    p_why: (quit.why?.trim() || null) as string,
    p_on_home: quit.onHome ?? false,
    p_at: startedAt.toISOString(),
  });
  // 23505: the unique index on (user, lower(trim(title))).
  if (error?.code === "23505") return { result: "already_tracking" as const };
  if (error) throw new Error(`starting the quit: ${error.message}`);
  return { result: "started" as const, id: data };
}

/** Pause, end, resume or restart. Resuming or restarting needs room on the plan, and starts a new streak. */
export async function setQuitStatus(db: Db, id: string, status: QuitStatus, now: Date) {
  if (status === "active") {
    const { data: row } = await db.from("quits").select("status").eq("id", id).maybeSingle();
    if (row && row.status !== "active") await requireRoom(db, "quits");
  }
  const { data, error } = await db.rpc("set_quit_status", { p_id: id, p_status: status, p_at: now.toISOString() });
  if (error) throw new Error(`changing the quit: ${error.message}`);
  return { result: data as "changed" | "unchanged" | "not_found" };
}

/** A new daily cap for cutting down. Raising it starts a new attempt; lowering it keeps the streak. */
export async function setQuitCap(db: Db, id: string, cap: number, now: Date) {
  const { data: row } = await db.from("quits").select("kind, limit_per_day").eq("id", id).maybeSingle();
  if (!row) return { result: "not_found" as const };
  if (row.kind !== "limit") throw new QuitRuleError("Quitting completely has no daily cap.");
  validateSetup("limit", cap, "times"); // checks the number; the unit isn't changing
  const { data, error } = await db.rpc("set_quit_cap", { p_id: id, p_cap: cap, p_at: now.toISOString() });
  if (error) throw new Error(`changing the cap: ${error.message}`);
  return { result: data as "raised" | "lowered" | "unchanged" | "not_found" | "not_limit" };
}

export interface QuitDetails {
  title?: string;
  alias?: string | null;
  why?: string | null;
  onHome?: boolean;
  showNameToAi?: boolean;
}

export async function updateQuitDetails(db: Db, id: string, details: QuitDetails) {
  checkLengths(details);
  const patch: TablesUpdate<"quits"> = {};
  if (details.title !== undefined) {
    const title = details.title.trim();
    if (!title) throw new QuitRuleError("Name the habit.");
    patch.title = title;
  }
  if (details.alias !== undefined) patch.alias = details.alias?.trim() || null;
  if (details.why !== undefined) patch.why = details.why?.trim() || null;
  if (details.onHome !== undefined) patch.on_home = details.onHome;
  if (details.showNameToAi !== undefined) patch.show_name_to_ai = details.showNameToAi;
  if (!Object.keys(patch).length) return { result: "unchanged" as const };
  const { data, error } = await db.from("quits").update(patch).eq("id", id).select("id");
  if (error?.code === "23505") return { result: "already_tracking" as const };
  if (error) throw new Error(`updating the quit: ${error.message}`);
  return { result: data.length ? ("updated" as const) : ("not_found" as const) };
}

/** Deletes the quit and its history. The XP it earned stays. */
export async function deleteQuit(db: Db, id: string) {
  const { data, error } = await db.from("quits").delete().eq("id", id).select("id");
  if (error) throw new Error(`deleting the quit: ${error.message}`);
  return { result: data.length ? ("deleted" as const) : ("not_found" as const) };
}

export interface NewQuitLog {
  /** When it happened; defaults to now. Can be backdated within the tracked time. */
  at?: Date | null;
  /** Usage, for cutting down. */
  amount?: number | null;
  note?: string | null;
  cause?: string | null;
}

/**
 * Logs a relapse (quit) or usage (cut down), with +2 honesty XP the first
 * time today. Returns the progress after it: reset, or still going.
 */
export async function logQuit(db: Db, id: string, log: NewQuitLog, now: Date) {
  const tz = currentConfig().timeZone;
  const data = await loadQuitData(db, { id });
  const row = data.rows[0];
  if (!row) return { result: "not_found" as const };
  if (row.status !== "active") throw new QuitRuleError("This isn't being tracked right now. Resume it first.");

  const at = log.at ?? now;
  const amount = log.amount ?? null;
  const note = validateLog(row.kind, { at, amount, note: log.note }, data.periods.get(id) ?? [], now);
  const cause = log.cause?.trim().slice(0, 40) || null;

  // Honesty days are keyed to when it's logged: only today's rows matter.
  const startOfToday = zonedInstant(dayKey(now, tz), "00:00", tz);
  const { data: bonusRows, error: bonusError } = await db
    .from("xp_log")
    .select("at")
    .eq("quit_id", id)
    .eq("reason", "quit_honesty")
    .gte("at", startOfToday.toISOString());
  if (bonusError) throw new Error(`checking the honesty bonus: ${bonusError.message}`);
  const due = honestyDue(now, new Set((bonusRows ?? []).map((r) => dayKey(new Date(r.at), tz))), tz);
  const xp = due ? honestyXp() : [];

  const { error } = await db.rpc("log_quit", {
    p_id: id,
    p_at: at.toISOString(),
    p_amount: amount as number,
    p_note: note as string,
    p_cause: cause as string,
    p_xp: xp as unknown as Json,
  });
  if (error) throw new Error(`logging it: ${error.message}`);

  const after = await loadQuit(db, id, now);
  return {
    result: "logged" as const,
    honestyXp: xp.reduce((s, e) => s + e.amount, 0),
    quit: after?.quit ?? null,
  };
}
