"use server";

import { revalidatePath } from "next/cache";
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
