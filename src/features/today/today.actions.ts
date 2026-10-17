"use server";

import { completeTask, markTaskMissed, type CompleteResult, type MissTaskResult } from "@/features/tasks/tasks.repo";
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
