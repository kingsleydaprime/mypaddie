import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import { checkEnd, currentStatus, holdOf, phoneFreeAt, STATUS_INFO, type ClassBlock, type StatusKind, type StatusRow } from "./status";

const tz = () => currentConfig().timeZone;

/** What's in force now: their status, else a running class, else a phone-free window. */
export async function loadStatus(db: Db, now: Date) {
  const today = dayKey(now, tz());
  const [rows, classes, schedule] = await Promise.all([
    db.from("statuses").select("kind, note, started_at, ends_at, ended_at").is("ended_at", null).gt("ends_at", now.toISOString()),
    db
      .from("tasks")
      .select("title, due_at, duration_minutes")
      .not("course_id", "is", null)
      .not("recurrence", "is", null)
      .neq("status", "cancelled")
      .eq("occurs_on", today),
    loadSchedule(db),
  ]);
  if (rows.error) throw new Error(`loading status: ${rows.error.message}`);
  if (classes.error) throw new Error(`loading classes: ${classes.error.message}`);

  const statusRows: StatusRow[] = rows.data.map((r) => ({ kind: r.kind as StatusKind, note: r.note, startedAt: new Date(r.started_at), endsAt: new Date(r.ends_at), endedAt: null }));
  const blocks: ClassBlock[] = classes.data.filter((c) => c.due_at).map((c) => ({ title: c.title, start: new Date(c.due_at!), minutes: c.duration_minutes ?? 60 }));
  const window = phoneFreeAt(localTimeOf(now, tz()), schedule);
  const windowEnd = window ? zonedInstant(window.end < window.start && localTimeOf(now, tz()) >= window.start ? dayKey(new Date(now.getTime() + 86_400_000), tz()) : today, window.end, tz()) : null;

  const current = currentStatus(statusRows, blocks, windowEnd, now);
  const hold = holdOf(current);
  return current
    ? {
        kind: current.kind,
        label: current.kind === "phone_free" ? `Phone-free ${window?.which ?? ""}`.trim() : STATUS_INFO[current.kind].label,
        note: current.note,
        source: current.source,
        until: localTimeOf(current.until, tz()),
        hold,
      }
    : null;
}

/** Set where they are until a time. A new status replaces whatever they'd set before. */
export async function setStatus(db: Db, input: { kind: StatusKind; until: Date; note?: string | null; leaveLeadMinutes?: number }, now: Date) {
  const check = checkEnd(input.until, now);
  if (!check.ok) return { result: check.reason };
  await db.from("statuses").update({ ended_at: now.toISOString() }).is("ended_at", null).gt("ends_at", now.toISOString());
  const { error } = await db.from("statuses").insert({
    kind: input.kind,
    note: input.note?.trim() || null,
    started_at: now.toISOString(),
    ends_at: input.until.toISOString(),
    ...(input.leaveLeadMinutes ? { leave_lead_minutes: input.leaveLeadMinutes } : {}),
  });
  if (error) throw new Error(`setting status: ${error.message}`);
  const info = STATUS_INFO[input.kind];
  return {
    result: "set" as const,
    status: info.label,
    until: localTimeOf(input.until, tz()),
    meaning:
      info.hold === "all"
        ? "Nothing will be sent until then; anything due comes after."
        : info.hold === "soft"
          ? `Only what's coming up gets through${info.leave ? `, and a nudge to head out ${input.leaveLeadMinutes ?? 30} minutes before the next thing` : ""}.`
          : "Pushes carry on as normal.",
  };
}

/** Back to normal: the status they set ends now (a running class or phone-free window still applies). */
export async function clearStatus(db: Db, now: Date) {
  const { data, error } = await db.from("statuses").update({ ended_at: now.toISOString() }).is("ended_at", null).gt("ends_at", now.toISOString()).select("kind");
  if (error) throw new Error(`clearing status: ${error.message}`);
  return { result: data.length ? ("cleared" as const) : ("nothing_set" as const), now: await loadStatus(db, now) };
}

/** "18:30" → the next time it's that o'clock (today, or tomorrow if passed); or minutes from now. */
export function untilFrom(input: { until?: string; minutes?: number }, now: Date): Date | null {
  if (input.minutes) return new Date(now.getTime() + input.minutes * 60_000);
  if (!input.until) return null;
  const today = dayKey(now, tz());
  const at = zonedInstant(today, input.until, tz());
  return at.getTime() > now.getTime() ? at : zonedInstant(dayKey(new Date(now.getTime() + 86_400_000), tz()), input.until, tz());
}
