"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { RELATIONS, type Relation } from "./people";
import { addPerson, logContact, updatePerson } from "./people.repo";

export type PersonFormState = null | { ok: true } | { error: string };

export async function addPersonAction(_prev: PersonFormState, form: FormData): Promise<PersonFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const name = get("name");
  if (!name) return { error: "Their name?" };
  const relation = get("relation") as Relation;
  const every = get("every") ? Number(get("every")) : null;
  if (every !== null && !(Number.isInteger(every) && every >= 1 && every <= 730)) return { error: "Reach out every 1–730 days" };
  const db = await requireDb("/app/people");
  const r = await addPerson(db, { name, relation: RELATIONS.includes(relation) ? relation : "friend", who: get("who") || null, birthday: get("birthday") || null, reachOutEveryDays: every, close: form.get("close") === "on" }, new Date());
  if (r.result === "exists") return { error: `${name} is already on your list` };
  revalidatePath("/app/people");
  return { ok: true };
}

export async function talkedTodayAction(id: string) {
  const db = await requireDb("/app/people");
  await logContact(db, id, { how: "chat" }, new Date());
  revalidatePath("/app/people");
}

export async function addTopicAction(id: string, form: FormData) {
  const topic = String(form.get("topic") ?? "").trim();
  if (!topic) return;
  const db = await requireDb("/app/people");
  await updatePerson(db, id, { addTopics: [topic] });
  revalidatePath("/app/people");
}

export async function removePersonAction(id: string) {
  const db = await requireDb("/app/people");
  await updatePerson(db, id, { remove: true });
  revalidatePath("/app/people");
}
