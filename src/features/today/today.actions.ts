"use server";

import { revalidatePath } from "next/cache";
import { planRoutineFinish, type StepStatus } from "@/features/routines/routines";
import { recordSlip } from "@/features/slips/slips.repo";
import { skipNeedsReason } from "@/features/tasks/skip";
import { completeTask, markTaskMissed, updateTask, type CompleteResult, type MissTaskResult } from "@/features/tasks/tasks.repo";
import { requireDb } from "@/shared/supabase/session";

/** The Today screen's "Done" button. Same engine, same rules as the MCP tool. */
export async function completeTaskAction(taskId: string): Promise<CompleteResult> {
  const db = await requireDb("/app");
  return completeTask(db, taskId, new Date());
}

/** The Today screen's "Miss" action. Same engine, same rules as the MCP tool. */
export async function missTaskAction(taskId: string, reason = "Self-reported miss"): Promise<MissTaskResult> {
  const db = await requireDb("/app");
  return markTaskMissed(db, taskId, reason, true, new Date());
}

export type SkipResult = { result: "skipped" } | { result: "skipped"; excuse: true } | { result: "needs_reason" | "not_found" | "already_done" };

/**
 * Skip this one. A must-do (a need, or a non-negotiable) is a slip: it takes a
 * line on why, logged and judged like log_slip — accepted, so no deduction,
 * unless it's the same reason too many times this week (the excuse rule).
 * Anything else is cancelled for the day, no questions, no XP lost.
 */
export async function skipTaskAction(taskId: string, why?: string): Promise<SkipResult> {
  const db = await requireDb("/app");
  const { data: task, error } = await db.from("tasks").select("id, status, is_non_negotiable, items(tier)").eq("id", taskId).maybeSingle();
  if (error) throw new Error(`loading the task: ${error.message}`);
  if (!task) return { result: "not_found" };
  if (task.status === "done") return { result: "already_done" };
  revalidatePath("/app");
  if (skipNeedsReason({ isNonNegotiable: task.is_non_negotiable, tier: task.items?.tier ?? null })) {
    const reason = why?.trim().slice(0, 300);
    if (!reason) return { result: "needs_reason" };
    const r = await recordSlip(db, { taskId, why: reason, category: "", accepts: true }, new Date());
    if (r.result === "not_found") return { result: "not_found" };
    return r.verdict.accepted ? { result: "skipped" } : { result: "skipped", excuse: true };
  }
  const r = await updateTask(db, taskId, {}, "cancel");
  return r.result === "cancelled" ? { result: "skipped" } : { result: r.result === "already_done" ? "already_done" : "not_found" };
}

/** Cancel a one-off, or stop a habit (no new days; past ones stay as history). */
export async function cancelTaskAction(taskId: string, habit: boolean) {
  const db = await requireDb("/app");
  const r = await updateTask(db, taskId, {}, habit ? "stop" : "cancel");
  revalidatePath("/app");
  return r.result === "cancelled" || r.result === "stopped" ? { result: r.result } : { result: "failed" as const };
}

export type FinishRoutineResult = { result: "finished"; missed: number; closed: number } | { result: "not_found" };

/**
 * Done on a routine card: the routine is finished for that day. Each step not
 * ticked is marked missed (self-reported: it costs XP, owning it earns some
 * back); one already skipped with a reason is closed instead. `stepIds` are
 * the card's steps; only steps of one routine are touched.
 */
export async function finishRoutineAction(stepIds: string[]): Promise<FinishRoutineResult> {
  const db = await requireDb("/app");
  const { data: steps, error } = await db.from("tasks").select("id, status, routine_id").in("id", stepIds);
  if (error) throw new Error(`loading the routine's steps: ${error.message}`);
  const routines = new Set(steps.map((s) => s.routine_id));
  if (steps.length === 0 || routines.size !== 1 || routines.has(null)) return { result: "not_found" };

  const plan = planRoutineFinish(steps.map((s) => ({ id: s.id, status: s.status as StepStatus })));
  const now = new Date();
  let missed = 0;
  for (const id of plan.miss) {
    const r = await markTaskMissed(db, id, "Not done when the routine was finished", true, now);
    if (r.result === "recorded") missed += 1;
  }
  let closed = 0;
  for (const id of plan.cancel) {
    const r = await updateTask(db, id, {}, "cancel", now);
    if (r.result === "cancelled") closed += 1;
  }
  revalidatePath("/app");
  return { result: "finished", missed, closed };
}
