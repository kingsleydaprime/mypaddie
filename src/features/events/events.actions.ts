"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { addEvent } from "./add-event";
import { EVENT_KINDS } from "./events";
import { changeEvent } from "./events.repo";
import { finishEvent, startEvent } from "./event-progress";

const optional = z.string().trim().transform((v) => v || undefined);
const schema = z.object({
  title: z.string().trim().min(1, "Give it a name"),
  kind: z.enum(EVENT_KINDS),
  date: z.iso.date({ message: "Pick a date" }),
  start_time: optional,
  end_time: optional,
  person: optional,
  reminder_note: optional,
});

export type EventFormState = null | { error: string } | { ok: string };

export async function addEventAction(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const db = await requireDb("/app/events");
  const result = await addEvent(db, { ...parsed.data, important: form.get("important") === "on", self_care: form.get("self_care") === "on" }, new Date());
  if ("error" in result) return { error: result.error };
  revalidatePath("/app/events");
  const clash = result.clashes[0];
  return { ok: clash ? `Added. Heads up: it overlaps ${clash.title} (${clash.at.slice(11)}).` : "Added." };
}

export async function cancelEventAction(id: string) {
  const db = await requireDb("/app/events");
  await changeEvent(db, id, "cancel");
  revalidatePath("/app/events");
}

/** Start an event early (its own time starts it anyway); a running task pauses. */
export async function startEventAction(id: string) {
  const db = await requireDb("/app/events");
  await startEvent(db, id, new Date());
  revalidatePath("/app/events");
  revalidatePath("/app");
}

/** Finished it, or weren't at it — either way it stops being in progress. */
export async function finishEventAction(id: string, how: "done" | "not_at_it") {
  const db = await requireDb("/app");
  await finishEvent(db, id, how);
  revalidatePath("/app");
  revalidatePath("/app/events");
}
