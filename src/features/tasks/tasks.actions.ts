"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { deleteTask, startTask, tickTaskStep, updateTask } from "./tasks.repo";
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
  // "role:<id>" / "course:<id>" / "" (nothing). Absent when the picker is locked (a class): leave the links alone.
  const forRaw = form.get("for");
  const link = forRaw === null ? null : parseFor(String(forRaw));
  if (link === "invalid") return { error: "Pick what it's for from the list" };
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
      selfCare: form.get("selfCare") === "on",
      // One step per line; steps that stay keep their tick.
      checklist: String(form.get("checklist") ?? "").split("\n"),
      reminderNote: String(form.get("note") ?? "").trim() || null,
      details: String(form.get("details") ?? "").slice(0, 2000).trim() || null,
      forceClash: form.get("force") === "on",
      ...(link ? { commitmentId: link.commitmentId, courseId: link.courseId } : {}),
    },
    "edit",
  );
  if (outcome.result === "clash" || outcome.result === "over_capacity") return { error: refusalMessage(outcome) };
  if (outcome.result !== "updated") return { error: outcome.result === "already_done" ? "It's already done — done tasks can't change." : "Task not found." };
  return { ok: "Saved." };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One "for" at a time: choosing a role clears the course, and the other way round. */
function parseFor(v: string): { commitmentId: string | null; courseId: string | null } | "invalid" {
  if (v === "") return { commitmentId: null, courseId: null };
  const [kind, id] = v.split(":");
  if (!id || !UUID.test(id)) return "invalid";
  if (kind === "role") return { commitmentId: id, courseId: null };
  if (kind === "course") return { commitmentId: null, courseId: id };
  return "invalid";
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

/** Start (in progress) or stop a task from its page. */
export async function startTaskAction(id: string, stop: boolean): Promise<TaskFormState> {
  const db = await requireDb(`/app/tasks/${id}`);
  const r = await startTask(db, id, new Date(), stop);
  revalidatePath(`/app/tasks/${id}`);
  if (r.result === "not_open") return { error: "It's not open any more." };
  if (r.result === "not_found") return { error: "Task not found." };
  return { ok: r.result === "stopped" || r.result === "not_started" ? "Stopped." : "Started." };
}

/** Tick or untick one checklist step (1-based) from the task's page. */
export async function tickStepAction(id: string, step: number, done: boolean): Promise<TaskFormState> {
  const db = await requireDb(`/app/tasks/${id}`);
  const r = await tickTaskStep(db, id, step, done);
  revalidatePath(`/app/tasks/${id}`);
  if (r.result !== "ticked") return { error: r.result === "not_open" ? "It's not open any more." : "That step isn't there any more — refresh." };
  return { ok: r.allDone ? "all_done" : "ticked" };
}
