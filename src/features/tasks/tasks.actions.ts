"use server";

import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { deleteTask, updateTask } from "./tasks.repo";
import { refusalMessage } from "./ui/refusal";

export type TaskFormState = null | { error: string } | { ok: string };

const time = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveTaskAction(_prev: TaskFormState, form: FormData): Promise<TaskFormState> {
  const id = String(form.get("id"));
  const db = await requireDb(`/app/tasks/${id}`);
  const title = String(form.get("title") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const t = String(form.get("time") ?? "");
  const duration = String(form.get("duration") ?? "");
  const habit = form.get("habit") === "1";
  if (!title) return { error: "Give it a name" };
  if (t && !time.test(t)) return { error: "Time must be HH:MM" };
  const minutes = duration ? Number(duration) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return { error: "Duration must be 1–1440 minutes" };

  const outcome = await updateTask(
    db,
    id,
    {
      title,
      // A habit's days come from its rule; only one-offs can move date.
      ...(habit ? {} : date ? { dueDate: date } : {}),
      dueTime: t || null,
      durationMinutes: minutes,
      nonNegotiable: form.get("must") === "on",
      reminderNote: String(form.get("note") ?? "").trim() || null,
      forceClash: form.get("force") === "on",
    },
    "edit",
  );
  if (outcome.result === "clash" || outcome.result === "over_capacity") return { error: refusalMessage(outcome) };
  if (outcome.result !== "updated") return { error: outcome.result === "already_done" ? "It's already done — done tasks can't change." : "Task not found." };
  return { ok: "Saved." };
}

export async function taskAction(id: string, action: "cancel" | "stop" | "delete"): Promise<TaskFormState> {
  const db = await requireDb(`/app/tasks/${id}`);
  if (action === "delete") {
    const r = await deleteTask(db, id);
    if (r.result === "has_history") return { error: "It has history (XP or slips), so it stays on the record. Cancel it instead." };
    redirect("/app");
  }
  const r = await updateTask(db, id, {}, action);
  if (r.result === "already_done") return { error: "It's already done." };
  redirect("/app");
}
