import type { Db } from "@/shared/supabase/token-client";
import { blockOn, selfCareByDefault, type EventKind, type EventLike } from "./events";

const COLUMNS = "id, title, kind, starts_at, ends_at, all_day, important, yearly, status, person, location, notes, reminder_note, is_self_care, started_at";

type Row = {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  important: boolean;
  yearly: boolean;
  status: string;
  person: string | null;
  location: string | null;
  notes: string | null;
  reminder_note: string | null;
  is_self_care: boolean;
  started_at: string | null;
};

export type EventRecord = EventLike & { person: string | null; location: string | null; notes: string | null; reminderNote: string | null; selfCare: boolean; startedAt: Date | null };

const toEvent = (r: Row): EventRecord => ({
  id: r.id,
  title: r.title,
  kind: r.kind as EventKind,
  startsAt: new Date(r.starts_at),
  endsAt: r.ends_at ? new Date(r.ends_at) : null,
  allDay: r.all_day,
  important: r.important,
  yearly: r.yearly,
  status: r.status as EventLike["status"],
  person: r.person,
  location: r.location,
  notes: r.notes,
  reminderNote: r.reminder_note,
  selfCare: r.is_self_care,
  startedAt: r.started_at ? new Date(r.started_at) : null,
});

/** Every upcoming event (yearly ones keep their original date; occurrences are computed). */
export async function loadUpcomingEvents(db: Db): Promise<EventRecord[]> {
  const { data, error } = await db.from("events").select(COLUMNS).eq("status", "upcoming");
  if (error) throw new Error(`loading events: ${error.message}`);
  return (data as Row[]).map(toEvent);
}

/** Timed events as blocks on one day, shaped like tasks for the clash and capacity checks. */
export async function eventBlocksOn(db: Db, day: string) {
  return (await loadUpcomingEvents(db)).flatMap((e) => {
    const block = blockOn(e, day);
    return block
      ? [{ id: `event:${e.id}`, title: e.title, dueAt: block.start, durationMinutes: block.minutes, status: "pending" as const, selfCare: e.selfCare }]
      : [];
  });
}

export interface NewEvent {
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  important: boolean;
  yearly: boolean;
  person?: string | null;
  location?: string | null;
  notes?: string | null;
  reminderNote?: string | null;
  commitmentId?: string | null;
  /** Uses the waking day, not work hours. Default: by kind (social, birthday, anniversary, wedding). */
  selfCare?: boolean;
}

export async function insertEvent(db: Db, e: NewEvent) {
  const { data, error } = await db
    .from("events")
    .insert({
      title: e.title,
      kind: e.kind,
      starts_at: e.startsAt.toISOString(),
      ends_at: e.endsAt?.toISOString() ?? null,
      all_day: e.allDay,
      important: e.important,
      yearly: e.yearly,
      person: e.person ?? null,
      location: e.location ?? null,
      notes: e.notes ?? null,
      reminder_note: e.reminderNote?.trim() || null,
      commitment_id: e.commitmentId ?? null,
      is_self_care: e.selfCare ?? selfCareByDefault(e.kind),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`saving the event: ${error.message}`);
  return toEvent(data as Row);
}

export async function changeEvent(
  db: Db,
  id: string,
  action: "edit" | "cancel" | "done" | "delete",
  changes: Partial<NewEvent> = {},
) {
  if (action === "delete") {
    const { data, error } = await db.from("events").delete().eq("id", id).select("id");
    if (error) throw new Error(`deleting the event: ${error.message}`);
    return { result: data.length ? ("deleted" as const) : ("not_found" as const) };
  }
  const patch =
    action === "edit"
      ? {
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.kind !== undefined ? { kind: changes.kind } : {}),
          // Said outright, it's what they said; a new kind without it brings that kind's default.
          ...(changes.selfCare !== undefined
            ? { is_self_care: changes.selfCare }
            : changes.kind !== undefined
              ? { is_self_care: selfCareByDefault(changes.kind) }
              : {}),
          ...(changes.startsAt !== undefined ? { starts_at: changes.startsAt.toISOString() } : {}),
          ...(changes.endsAt !== undefined ? { ends_at: changes.endsAt?.toISOString() ?? null } : {}),
          ...(changes.allDay !== undefined ? { all_day: changes.allDay } : {}),
          ...(changes.important !== undefined ? { important: changes.important } : {}),
          ...(changes.yearly !== undefined ? { yearly: changes.yearly } : {}),
          ...(changes.person !== undefined ? { person: changes.person } : {}),
          ...(changes.location !== undefined ? { location: changes.location } : {}),
          ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
          ...(changes.reminderNote !== undefined ? { reminder_note: changes.reminderNote?.trim() || null } : {}),
        }
      : { status: action === "cancel" ? "cancelled" : "done" };
  const { data, error } = await db.from("events").update(patch).eq("id", id).select("id");
  if (error) throw new Error(`updating the event: ${error.message}`);
  return { result: data.length ? (action === "edit" ? ("updated" as const) : action === "cancel" ? ("cancelled" as const) : ("done" as const)) : ("not_found" as const) };
}

