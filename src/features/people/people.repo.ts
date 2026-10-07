import { addEvent } from "@/features/events/add-event";
import { completeTask, createTask } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey } from "@/shared/time";
import { CONTACT_WEIGHTS, contactXp, daysSinceContact, daysToBirthday, reachOutDue, type ContactHow, type Relation } from "./people";

const COLUMNS = "id, name, relation, who, notes, birthday, reach_out_every_days, topics, close, last_contact_at, created_at";
type Row = {
  id: string; name: string; relation: Relation; who: string | null; notes: string | null; birthday: string | null;
  reach_out_every_days: number | null; topics: string[]; close: boolean; last_contact_at: string | null; created_at: string;
};

export const toPerson = (r: Row) => ({
  id: r.id, name: r.name, relation: r.relation, who: r.who, notes: r.notes, birthday: r.birthday,
  reachOutEveryDays: r.reach_out_every_days, topics: r.topics, close: r.close,
  lastContactAt: r.last_contact_at ? new Date(r.last_contact_at) : null, createdAt: new Date(r.created_at),
});
export type Person = ReturnType<typeof toPerson>;

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function loadPeople(db: Db): Promise<Person[]> {
  const { data, error } = await db.from("people").select(COLUMNS).order("name");
  if (error) throw new Error(`loading people: ${error.message}`);
  return (data as Row[]).map(toPerson);
}

export async function findPerson(db: Db, ref: string): Promise<Person | null> {
  const all = await loadPeople(db);
  const r = ref.trim().toLowerCase();
  return all.find((p) => (isUuid(r) ? p.id === r : p.name.toLowerCase() === r)) ?? null;
}

export interface PersonInput {
  name: string;
  relation?: Relation;
  who?: string | null;
  notes?: string | null;
  birthday?: string | null;
  reachOutEveryDays?: number | null;
  topics?: string[];
  close?: boolean;
}

/** Adds someone; a birthday also goes on the calendar (yearly, important if they're close). */
export async function addPerson(db: Db, input: PersonInput, now: Date) {
  const { data, error } = await db
    .from("people")
    .insert({
      name: input.name.trim(),
      relation: input.relation ?? "friend",
      who: input.who?.trim() || null,
      notes: input.notes?.trim() || null,
      birthday: input.birthday ?? null,
      reach_out_every_days: input.reachOutEveryDays ?? null,
      topics: (input.topics ?? []).map((t) => t.trim()).filter(Boolean),
      close: input.close ?? false,
    })
    .select(COLUMNS)
    .single();
  if (error?.code === "23505") return { result: "exists" as const, name: input.name.trim() };
  if (error) throw new Error(`adding the person: ${error.message}`);
  let birthdayEvent = null;
  if (input.birthday) {
    const made = await addEvent(db, { title: `${input.name.trim()}'s birthday`, kind: "birthday", date: input.birthday, important: input.close ?? false, yearly: true, person: input.name.trim() }, now);
    birthdayEvent = "error" in made ? null : made.event.id;
  }
  return { result: "added" as const, person: toPerson(data as Row), birthdayOnCalendar: Boolean(birthdayEvent) };
}

export async function updatePerson(
  db: Db,
  ref: string,
  changes: Partial<PersonInput> & { addTopics?: string[]; removeTopics?: string[]; remove?: boolean },
) {
  const p = await findPerson(db, ref);
  if (!p) return { result: "not_found" as const };
  if (changes.remove) {
    await db.from("people").delete().eq("id", p.id);
    return { result: "removed" as const, name: p.name };
  }
  let topics = p.topics;
  if (changes.topics) topics = changes.topics;
  if (changes.addTopics) topics = [...topics, ...changes.addTopics.map((t) => t.trim()).filter((t) => t && !topics.some((x) => x.toLowerCase() === t.toLowerCase()))];
  if (changes.removeTopics) topics = topics.filter((t) => !changes.removeTopics!.some((r) => r.trim().toLowerCase() === t.toLowerCase()));
  const { error } = await db
    .from("people")
    .update({
      ...(changes.name ? { name: changes.name.trim() } : {}),
      ...(changes.relation ? { relation: changes.relation } : {}),
      ...(changes.who !== undefined ? { who: changes.who?.trim() || null } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes?.trim() || null } : {}),
      ...(changes.birthday !== undefined ? { birthday: changes.birthday } : {}),
      ...(changes.reachOutEveryDays !== undefined ? { reach_out_every_days: changes.reachOutEveryDays } : {}),
      ...(changes.close !== undefined ? { close: changes.close } : {}),
      topics,
    })
    .eq("id", p.id);
  if (error?.code === "23505") return { result: "exists" as const, name: changes.name };
  if (error) throw new Error(`updating the person: ${error.message}`);
  return { result: "updated" as const, name: changes.name?.trim() ?? p.name, topics };
}

/**
 * They were in touch: logged with how and what about, last contact moved, and
 * XP paid through a task done on the spot (so it can't be paid twice). Topics
 * talked about come off their list.
 */
export async function logContact(db: Db, ref: string, input: { how?: ContactHow; note?: string | null; coveredTopics?: string[] }, now: Date) {
  const p = await findPerson(db, ref);
  if (!p) return { result: "not_found" as const };
  const how = input.how ?? "chat";
  const task = await createTask(
    db,
    { title: `Reached out: ${p.name}`, itemId: null, baseXp: contactXp(how), dueDate: null, dueTime: null, recurrence: null, nonNegotiable: false, weights: CONTACT_WEIGHTS },
    now,
  );
  const completed = task.result === "created" ? await completeTask(db, task.task.id, now) : null;
  const { error } = await db.from("people_contacts").insert({ person_id: p.id, at: now.toISOString(), how, note: input.note?.trim() || null, task_id: task.result === "created" ? task.task.id : null });
  if (error) throw new Error(`logging the contact: ${error.message}`);
  const covered = (input.coveredTopics ?? []).map((t) => t.trim().toLowerCase());
  await db.from("people").update({ last_contact_at: now.toISOString(), topics: p.topics.filter((t) => !covered.includes(t.toLowerCase())) }).eq("id", p.id);
  return { result: "logged" as const, name: p.name, xp: completed && completed.result === "completed" ? completed.xp : 0 };
}

/** Everyone, with when you last spoke, whether they're due, birthdays coming up, recent contacts and open promises to them. */
export async function loadPeoplePicture(db: Db, now: Date) {
  const people = await loadPeople(db);
  const [contacts, promises] = await Promise.all([
    db.from("people_contacts").select("person_id, at, how, note").order("at", { ascending: false }).limit(200),
    db.from("promises").select("person, what, due_at").eq("status", "open"),
  ]);
  const tz = currentConfig().timeZone;
  return people.map((p) => ({
    ...p,
    daysSince: p.lastContactAt ? daysSinceContact(p, now) : null,
    due: reachOutDue(p, now),
    birthdayIn: p.birthday ? daysToBirthday(p.birthday, now) : null,
    recent: (contacts.data ?? []).filter((c) => c.person_id === p.id).slice(0, 3).map((c) => ({ on: dayKey(new Date(c.at), tz), how: c.how, note: c.note })),
    promises: (promises.data ?? []).filter((x) => x.person.trim().toLowerCase() === p.name.toLowerCase()).map((x) => ({ what: x.what, due: x.due_at })),
  }));
}
