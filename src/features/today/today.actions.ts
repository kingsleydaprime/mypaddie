"use server";

import { completeTask, type CompleteResult } from "@/features/tasks/tasks.repo";
import { requireDb } from "@/shared/supabase/session";

/** The Today screen's "Done" button. Same engine, same rules as the MCP tool. */
export async function completeTaskAction(taskId: string): Promise<CompleteResult> {
  const db = await requireDb("/app");
  return completeTask(db, taskId, new Date());
}
