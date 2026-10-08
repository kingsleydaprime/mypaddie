import { findClashes } from "@/features/tasks/capacity";
import { createTask, loadDayTasks, type CreateResult } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, formatLocal, zonedInstant } from "@/shared/time";
import { upcoming, type EventKind, type Quadrant } from "./events";
import { insertEvent } from "./events.repo";

// Its own file: it needs tasks.repo, and tasks.repo needs events.repo (for
// event blocks) — keeping this out of events.repo avoids a circular import.

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
export interface AddEventInput {
  title: string;
  kind: EventKind;
  /** Local date "YYYY-MM-DD". */
  date: string;
  start_time?: string;
  end_time?: string;
  important: boolean;
  yearly?: boolean;
  person?: string;
  location?: string;
  notes?: string;
  reminder_note?: string;
  prep?: { days_before: number; title?: string; duration_minutes?: number };
  /** The job, role, team or group it's for. */
  commitment_id?: string | null;
  /** Uses the waking day, not work hours. Default: by kind. */
  self_care?: boolean;
}

/**
 * Saves an event, reports (never refuses) clashes with the day's tasks and
 * events, and optionally creates a prep task ahead of it — which turns into a
 * must-do on its day.
 */
export type AddEventResult =
  | { error: string }
  | {
      event: { id: string; title: string; quadrant: Quadrant | undefined; daysAway: number | undefined; yearly: boolean };
      clashes: { title: string; at: string }[];
      prep: CreateResult | null;
    };

export async function addEvent(db: Db, args: AddEventInput, now: Date): Promise<AddEventResult> {
    const allDay = !args.start_time;
    const startsAt = zonedInstant(args.date, args.start_time ?? "00:00", tz());
    const endsAt = args.start_time && args.end_time ? zonedInstant(args.date, args.end_time, tz()) : null;
    if (endsAt && endsAt <= startsAt) return { error: "the end must be after the start" };
    const yearly = args.yearly ?? (args.kind === "birthday" || args.kind === "anniversary");

    const event = await insertEvent(db, {
      title: args.title, kind: args.kind, startsAt, endsAt, allDay, important: args.important, yearly,
      person: args.person, location: args.location, notes: args.notes, reminderNote: args.reminder_note,
      commitmentId: args.commitment_id ?? null,
      selfCare: args.self_care,
    });

    // Informational: events aren't refused for clashing — you go to the wedding.
    const day = dayKey(upcoming([event], now, 3660)[0]?.at ?? startsAt, tz());
    const clashes = allDay
      ? []
      : findClashes(startsAt, endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : 60, await loadDayTasks(db, day), `event:${event.id}`)
          .map((c) => ({ title: c.title, at: formatLocal(c.start, tz()) }));

    let prep = null;
    if (args.prep) {
      const prepDay = addDays(day, -args.prep.days_before);
      prep = await createTask(
        db,
        {
          title: args.prep.title ?? `Prep: ${args.title}`,
          itemId: null,
          baseXp: 10,
          dueDate: prepDay < dayKey(now, tz()) ? dayKey(now, tz()) : prepDay,
          dueTime: null,
          recurrence: null,
          nonNegotiable: false,
          weights: [{ pillar: "relationships", weight: 50 }, { pillar: "character", weight: 50 }],
          durationMinutes: args.prep.duration_minutes ?? 60,
          mustFrom: zonedInstant(prepDay < dayKey(now, tz()) ? dayKey(now, tz()) : prepDay, "09:00", tz()),
          commitmentId: args.commitment_id ?? null,
        },
        now,
      );
    }
  const view = upcoming([event], now, 3660)[0];
  return { event: { id: event.id, title: event.title, quadrant: view?.quadrant, daysAway: view?.daysAway, yearly }, clashes, prep };
}
