import { capacityFor, DEFAULT_DURATION } from "@/features/tasks/capacity";
import { requireRoom } from "@/features/plans/guard";
import { parseRecurrence } from "@/features/tasks/recurrence";
import { createTask, loadCapacity, loadDayTasks, updateTask, type CreateResult } from "@/features/tasks/tasks.repo";
import type { PillarWeight } from "@/features/xp/split";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import {
  assessLoad,
  weeklyMinutes,
  type CommitmentKind,
  type CommitmentLoad,
  type CommitmentPriority,
  type CommitmentStatus,
} from "./commitments";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const COLUMNS = "id, kind, title, org, priority, status, starts_on, ends_on, extra_minutes_per_week, notes, created_at";

export interface Commitment {
  id: string;
  kind: CommitmentKind;
  title: string;
  org: string | null;
  priority: CommitmentPriority;
  status: CommitmentStatus;
  starts_on: string | null;
  ends_on: string | null;
  extra_minutes_per_week: number;
  notes: string | null;
}

export const commitmentLabel = (c: { title: string; org: string | null }) => (c.org ? `${c.title}, ${c.org}` : c.title);

/** What showing up for it builds, by default. A session can override. */
export function commitmentWeights(kind: CommitmentKind): PillarWeight[] {
  switch (kind) {
    case "full_time":
    case "part_time":
    case "freelance":
    case "internship":
      return [{ pillar: "skills", weight: 50 }, { pillar: "financial", weight: 30 }, { pillar: "character", weight: 20 }];
    case "team":
      return [{ pillar: "physical", weight: 60 }, { pillar: "social", weight: 20 }, { pillar: "character", weight: 20 }];
    case "leadership":
      return [{ pillar: "character", weight: 50 }, { pillar: "social", weight: 30 }, { pillar: "skills", weight: 20 }];
    case "membership":
      return [{ pillar: "social", weight: 60 }, { pillar: "character", weight: 40 }];
    default:
      return [{ pillar: "character", weight: 50 }, { pillar: "social", weight: 50 }];
  }
}

export async function loadCommitments(db: Db, opts: { includeEnded?: boolean } = {}): Promise<Commitment[]> {
  let query = db.from("commitments").select(COLUMNS).order("created_at");
  if (!opts.includeEnded) query = query.neq("status", "ended");
  const { data, error } = await query;
  if (error) throw new Error(`loading commitments: ${error.message}`);
  return data as Commitment[];
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** By id, title, org, or "title, org" — case-insensitively. Ambiguous = not found (ask which). */
export async function findCommitment(db: Db, ref: string): Promise<Commitment | null> {
  const all = await loadCommitments(db, { includeEnded: true });
  const r = ref.trim().toLowerCase();
  if (isUuid(r)) return all.find((c) => c.id === r) ?? null;
  const hits = all.filter((c) => [c.title, c.org ?? "", commitmentLabel(c)].some((s) => s.trim().toLowerCase() === r));
  return hits.length === 1 ? hits[0]! : null;
}

export interface SessionInput {
  /** e.g. "Team training", "Personal training", "Choir rehearsal", "Shift". */
  title: string;
  /** RRULE subset: FREQ=DAILY or FREQ=WEEKLY;BYDAY=TU,TH. */
  recurrence: string;
  /** Local "HH:MM"; omit for any time that day. */
  time?: string | null;
  minutes: number;
  weights?: PillarWeight[];
  startDate?: string;
}

/** A recurring session as a habit task tied to the commitment: it blocks time, reminds, and pays XP for showing up. */
export async function addSession(db: Db, c: Pick<Commitment, "id" | "kind">, s: SessionInput, now: Date): Promise<CreateResult> {
  parseRecurrence(s.recurrence);
  return createTask(
    db,
    {
      title: s.title.trim(),
      itemId: null,
      baseXp: 10,
      dueDate: s.startDate ?? null,
      dueTime: s.time ?? null,
      recurrence: s.recurrence,
      nonNegotiable: false,
      weights: s.weights ?? commitmentWeights(c.kind),
      durationMinutes: s.minutes,
      commitmentId: c.id,
    },
    now,
  );
}

export interface NewCommitment {
  kind: CommitmentKind;
  title: string;
  org?: string | null;
  priority?: CommitmentPriority;
  startsOn?: string | null;
  endsOn?: string | null;
  extraMinutesPerWeek?: number;
  notes?: string | null;
  sessions?: SessionInput[];
}

export async function addCommitment(db: Db, input: NewCommitment, now: Date) {
  await requireRoom(db, "commitments");
  const { data, error } = await db
    .from("commitments")
    .insert({
      kind: input.kind,
      title: input.title.trim(),
      org: input.org?.trim() || null,
      priority: input.priority ?? "important",
      starts_on: input.startsOn ?? null,
      ends_on: input.endsOn ?? null,
      extra_minutes_per_week: input.extraMinutesPerWeek ?? 0,
      notes: input.notes?.trim() || null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`saving the commitment: ${error.message}`);
  const commitment = data as Commitment;
  const sessions = [];
  for (const s of input.sessions ?? []) {
    const made = await addSession(db, commitment, s, now);
    sessions.push(made.result === "created" ? { session: s.title, result: "created" as const } : { session: s.title, ...made });
  }
  return { commitment, sessions };
}

export interface CommitmentChanges {
  kind?: CommitmentKind;
  title?: string;
  org?: string | null;
  priority?: CommitmentPriority;
  status?: CommitmentStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  extraMinutesPerWeek?: number;
  notes?: string | null;
}

/**
 * Edits a commitment. Pausing or ending it stops its recurring sessions and
 * cancels its open one-off tasks — the time comes back. Past sessions stay as
 * history. Resuming doesn't recreate them: add the sessions again.
 */
export async function updateCommitment(db: Db, ref: string, changes: CommitmentChanges, now: Date) {
  const c = await findCommitment(db, ref);
  if (!c) return { result: "not_found" as const };
  const { error } = await db
    .from("commitments")
    .update({
      ...(changes.kind ? { kind: changes.kind } : {}),
      ...(changes.title ? { title: changes.title.trim() } : {}),
      ...(changes.org !== undefined ? { org: changes.org?.trim() || null } : {}),
      ...(changes.priority ? { priority: changes.priority } : {}),
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.startsOn !== undefined ? { starts_on: changes.startsOn } : {}),
      ...(changes.endsOn !== undefined ? { ends_on: changes.endsOn } : {}),
      ...(changes.status === "ended" && changes.endsOn === undefined && !c.ends_on ? { ends_on: dayKey(now, tz()) } : {}),
      ...(changes.extraMinutesPerWeek !== undefined ? { extra_minutes_per_week: changes.extraMinutesPerWeek } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes?.trim() || null } : {}),
    })
    .eq("id", c.id);
  if (error) throw new Error(`updating the commitment: ${error.message}`);

  let stopped: string[] = [];
  if ((changes.status === "paused" || changes.status === "ended") && c.status === "active") {
    const { data: open } = await db.from("tasks").select("id, title, series_id").eq("commitment_id", c.id).eq("status", "pending");
    const seen = new Set<string>();
    for (const t of open ?? []) {
      if (t.series_id && seen.has(t.series_id)) continue;
      if (t.series_id) seen.add(t.series_id);
      const r = await updateTask(db, t.id, {}, t.series_id ? "stop" : "cancel", now);
      if (r.result === "stopped" || r.result === "cancelled") stopped.push(t.title);
    }
    stopped = [...new Set(stopped)];
  }
  return { result: "updated" as const, commitment: commitmentLabel({ title: changes.title ?? c.title, org: changes.org === undefined ? c.org : changes.org }), ...(stopped.length ? { stopped } : {}) };
}

/**
 * The next 7 days against their capacity, what each commitment takes, and —
 * when it's tight or over — what to drop. `adding` = minutes a week of
 * something he's thinking of taking on.
 */
export async function loadWeekLoad(db: Db, now: Date, adding?: number) {
  const today = dayKey(now, tz());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [capacity, commitments, dayTasks] = await Promise.all([
    loadCapacity(db),
    loadCommitments(db),
    Promise.all(days.map((d) => loadDayTasks(db, d))),
  ]);
  const minutes = (t: { durationMinutes: number | null }) => t.durationMinutes ?? DEFAULT_DURATION;
  const counted = (t: { status: string }) => t.status === "pending" || t.status === "done";
  const scheduled = dayTasks.flat().filter(counted).reduce((s, t) => s + minutes(t), 0);
  const capacityTotal = days.reduce((s, d) => s + capacityFor(d, capacity).minutes, 0);

  const active = commitments.filter((c) => c.status === "active");
  const ids = active.map((c) => c.id);
  const from = zonedInstant(today, "00:00", tz()).toISOString();
  const to = zonedInstant(addDays(today, 7), "00:00", tz()).toISOString();
  const [habits, oneOffs, events] = ids.length
    ? await Promise.all([
        db.from("tasks").select("commitment_id, series_id, recurrence, duration_minutes, occurs_on").in("commitment_id", ids).not("series_id", "is", null).order("occurs_on", { ascending: false }),
        db.from("tasks").select("commitment_id, duration_minutes").in("commitment_id", ids).is("series_id", null).in("status", ["pending", "done"]).gte("due_at", from).lt("due_at", to),
        db.from("events").select("commitment_id, starts_at, ends_at, all_day").in("commitment_id", ids).neq("status", "cancelled").gte("starts_at", from).lt("starts_at", to),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const perCommitment = new Map<string, number>(ids.map((id) => [id, 0]));
  const seenSeries = new Set<string>();
  for (const h of (habits.data ?? []) as { commitment_id: string; series_id: string; recurrence: string | null; duration_minutes: number | null }[]) {
    if (seenSeries.has(h.series_id) || !h.recurrence) continue;
    seenSeries.add(h.series_id);
    perCommitment.set(h.commitment_id, (perCommitment.get(h.commitment_id) ?? 0) + weeklyMinutes(parseRecurrence(h.recurrence), h.duration_minutes));
  }
  for (const t of (oneOffs.data ?? []) as { commitment_id: string; duration_minutes: number | null }[]) {
    perCommitment.set(t.commitment_id, (perCommitment.get(t.commitment_id) ?? 0) + (t.duration_minutes ?? DEFAULT_DURATION));
  }
  for (const e of (events.data ?? []) as { commitment_id: string; starts_at: string; ends_at: string | null; all_day: boolean }[]) {
    if (e.all_day) continue;
    const m = e.ends_at ? Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000) : 60;
    perCommitment.set(e.commitment_id, (perCommitment.get(e.commitment_id) ?? 0) + m);
  }

  const loads: CommitmentLoad[] = active.map((c) => ({
    id: c.id,
    title: commitmentLabel(c),
    priority: c.priority,
    scheduledMinutes: perCommitment.get(c.id) ?? 0,
    extraMinutes: c.extra_minutes_per_week,
  }));
  return assessLoad({ capacity: capacityTotal, scheduled, commitments: loads, adding });
}
