import { startTask } from "@/features/tasks/tasks.repo";
import type { Db } from "@/shared/supabase/token-client";
import { inProgress, startable } from "./events";
import { changeEvent, loadUpcomingEvents } from "./events.repo";

// Its own file: it needs tasks.repo, and tasks.repo needs events.repo (for
// event blocks) — keeping this out of events.repo avoids a circular import.

export type StartEventResult =
  | { result: "started"; title: string; until: string; paused: string[] }
  | { result: "already_in_progress"; title: string; until: string }
  | { result: "not_startable" | "over" | "not_found"; title?: string };

/**
 * Start an event early (they're in the meeting already). It takes over the
 * way its start time would: a task that's running is paused, its time kept.
 * Its own time starts it anyway; this is for before.
 */
export async function startEvent(db: Db, eventId: string, now: Date): Promise<StartEventResult> {
  const e = (await loadUpcomingEvents(db)).find((x) => x.id === eventId);
  if (!e) return { result: "not_found" };
  if (!startable(e)) return { result: "not_startable", title: e.title };
  const running = inProgress(e, now);
  if (running) return { result: "already_in_progress", title: e.title, until: running.until.toISOString() };
  const until = e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60_000);
  if (now >= until) return { result: "over", title: e.title };
  const { error } = await db.from("events").update({ started_at: now.toISOString() }).eq("id", eventId).eq("status", "upcoming");
  if (error) throw new Error(`starting the event: ${error.message}`);
  // Whatever task was running pauses, its time kept.
  const { data: tasks } = await db.from("tasks").select("id, title").eq("status", "pending").not("started_at", "is", null);
  const paused: string[] = [];
  for (const t of tasks ?? []) if ((await startTask(db, t.id, now, true)).result === "paused") paused.push(t.title);
  return { result: "started", title: e.title, until: until.toISOString(), paused };
}

/** Finished it (done), or weren't at it (cancelled). Only startable events: a birthday isn't finished. */
export async function finishEvent(db: Db, eventId: string, how: "done" | "not_at_it") {
  const e = (await loadUpcomingEvents(db)).find((x) => x.id === eventId);
  if (!e) return { result: "not_found" as const };
  if (!startable(e)) return { result: "not_startable" as const, title: e.title };
  const r = await changeEvent(db, eventId, how === "done" ? "done" : "cancel");
  return { ...r, title: e.title };
}

/** What's in progress right now: events happening (or started early), and the task being worked on. */
export async function loadInProgress(db: Db, now: Date) {
  const [events, { data: task }] = await Promise.all([
    loadUpcomingEvents(db),
    db.from("tasks").select("id, title, started_at, spent_minutes").eq("status", "pending").not("started_at", "is", null).limit(1).maybeSingle(),
  ]);
  return {
    events: events.flatMap((e) => {
      const p = inProgress(e, now);
      return p ? [{ id: e.id, title: e.title, since: p.since, until: p.until }] : [];
    }),
    task: task ? { id: task.id, title: task.title, since: new Date(task.started_at!), spentMinutes: task.spent_minutes } : null,
  };
}
