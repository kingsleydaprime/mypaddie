import { completeTask, createTask, type CreateResult } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey } from "@/shared/time";
import { buildDigest, draftSince, UPDATE_TASK_PREFIX, type Channel } from "./updates";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

export interface NewUpdate {
  recipient: string;
  channel: Channel;
  about: string;
  format?: string;
  /** Regular update: e.g. FREQ=WEEKLY;BYDAY=FR. Omit for a one-off. */
  recurrence?: string;
  /** One-off: the day it's due. Regular: the first day (default today). */
  dueDate?: string;
  dueTime?: string;
}

/**
 * Creates the update and the task that carries it — on Today, reminded the
 * morning of and 30 minutes before, with a note pointing at the draft. Goes
 * through createTask, so a full or clashing slot is refused (and nothing is saved).
 */
export async function addUpdate(db: Db, u: NewUpdate, now: Date): Promise<{ result: "created"; id: string } | CreateResult> {
  const task = await createTask(
    db,
    {
      title: `${UPDATE_TASK_PREFIX}${u.recipient}`,
      itemId: null,
      baseXp: 10,
      dueDate: u.dueDate ?? (u.recurrence ? dayKey(now, tz()) : null),
      dueTime: u.dueTime ?? null,
      recurrence: u.recurrence ?? null,
      nonNegotiable: false,
      weights: [{ pillar: "relationships", weight: 40 }, { pillar: "character", weight: 40 }, { pillar: "skills", weight: 20 }],
      durationMinutes: 15,
      reminders: ["morning", "30"],
      reminderNote: `${u.about} — ask Paddie to draft it`,
    },
    now,
  );
  if (task.result !== "created") return task;
  const { data, error } = await db
    .from("updates")
    .insert({ recipient: u.recipient.trim(), channel: u.channel, about: u.about.trim(), format: u.format?.trim() || null, task_id: task.task.id })
    .select("id")
    .single();
  if (error) throw new Error(`saving the update: ${error.message}`);
  return { result: "created", id: data.id };
}

export async function listUpdates(db: Db) {
  const { data, error } = await db
    .from("updates")
    .select("id, recipient, channel, about, format, active, last_sent_at, task_id, tasks(due_at, recurrence, series_id)")
    .order("created_at");
  if (error) throw new Error(`loading updates: ${error.message}`);
  return data;
}

/** Everything done since the last update — the raw material for a draft. */
export async function draftMaterial(db: Db, updateId: string, now: Date) {
  const { data: u, error } = await db.from("updates").select("id, recipient, channel, about, format, last_sent_at").eq("id", updateId).maybeSingle();
  if (error) throw new Error(`loading the update: ${error.message}`);
  if (!u) return null;
  const since = draftSince(u.last_sent_at ? new Date(u.last_sent_at) : null, now).toISOString();

  const [tasks, learning, workouts, apps, last] = await Promise.all([
    db.from("tasks").select("title, done_at").eq("status", "done").gte("done_at", since),
    db.from("learning_sessions").select("topic, minutes, skills(name)").gte("at", since),
    db.from("workout_logs").select("at, duration_minutes").gte("at", since),
    db.from("applications").select("title, status, submitted_at").gte("submitted_at", since),
    db.from("update_log").select("content, sent_at").eq("update_id", updateId).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [tasks, learning, workouts, apps]) if (r.error) throw new Error(`gathering activity: ${r.error.message}`);

  const digest = buildDigest({
    tasks: tasks.data!.map((t) => ({ title: t.title, doneAt: new Date(t.done_at!) })),
    learning: learning.data!.map((l) => ({ skill: (l.skills as unknown as { name: string } | null)?.name ?? "Learning", topic: l.topic, minutes: l.minutes })),
    workouts: workouts.data!.map((w) => ({ at: new Date(w.at), minutes: w.duration_minutes })),
    applications: apps.data!.map((x) => ({ title: x.title, status: x.status, at: new Date(x.submitted_at!) })),
  });
  return { update: u, since, digest, lastSent: last.data };
}

/** Log it as sent and complete today's update task (paying its XP). */
export async function markUpdateSent(db: Db, updateId: string, content: string | null, now: Date) {
  const { data: result, error } = await db.rpc("record_update_sent", { p_update_id: updateId, p_content: (content ?? null) as string, p_at: now.toISOString() });
  if (error) throw new Error(`logging the update: ${error.message}`);
  if (result !== "logged") return { result: "not_found" as const };

  const { data: u } = await db.from("updates").select("task_id, tasks(series_id, status)").eq("id", updateId).single();
  let completed = false;
  const t = u?.tasks as unknown as { series_id: string | null; status: string } | null;
  if (u?.task_id && t) {
    // Regular update: today's occurrence. One-off: the task itself.
    const { data: row } = t.series_id
      ? await db.from("tasks").select("id").eq("series_id", t.series_id).eq("occurs_on", dayKey(now, tz())).in("status", ["pending", "skipped"]).maybeSingle()
      : await db.from("tasks").select("id").eq("id", u.task_id).in("status", ["pending", "skipped"]).maybeSingle();
    if (row) completed = (await completeTask(db, row.id, now)).result === "completed";
  }
  return { result: "logged" as const, taskCompleted: completed };
}

export async function setUpdateActive(db: Db, updateId: string, active: boolean) {
  const { data, error } = await db.from("updates").update({ active }).eq("id", updateId).select("task_id");
  if (error) throw new Error(`updating: ${error.message}`);
  return data.length ? "updated" : "not_found";
}
