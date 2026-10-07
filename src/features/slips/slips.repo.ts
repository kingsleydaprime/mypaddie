import { loadMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { judgeSlip, type SlipReason } from "./slips";

/**
 * Record a skipped task and why, judged against the same habit's recent
 * reasons (the third same reason in a week is an excuse, whatever the AI
 * thought). Shared by log_slip and the evening close-out.
 */
export async function recordSlip(db: Db, input: { taskId: string; why: string; category: string; accepts: boolean }, now: Date) {
  const config = currentConfig();
  const { data: task, error: taskError } = await db.from("tasks").select("id, title, item_id").eq("id", input.taskId).maybeSingle();
  if (taskError) throw new Error(taskError.message);
  if (!task) return { result: "not_found" as const };
  const key = task.item_id ?? task.id;

  // Earlier slips on the same habit inside the window, with their reasons.
  const since = new Date(now.getTime() - (config.slips.excuseWindowDays + 1) * 86_400_000).toISOString();
  let previousQuery = db.from("slips").select("task_id, why, why_category, at, tasks!inner(item_id)").gte("at", since);
  previousQuery = task.item_id ? previousQuery.eq("tasks.item_id", task.item_id) : previousQuery.eq("task_id", task.id);
  const { data: previousRows, error: prevError } = await previousQuery;
  if (prevError) throw new Error(prevError.message);

  const previous: SlipReason[] = previousRows.map((r) => ({ key, why: r.why ?? "", category: r.why_category, at: new Date(r.at) }));
  const verdict = judgeSlip({ key, why: input.why, category: input.category, at: now }, input.accepts, previous, config);

  const toneBefore = await loadMode(db, now);
  const { error } = await db.rpc("record_slip", {
    p_task_id: task.id,
    p_why: input.why,
    p_why_category: input.category,
    p_accepted: verdict.accepted,
    p_tone: toneBefore.mode,
  });
  if (error) throw new Error(error.message);
  return { result: "recorded" as const, task: task.title, verdict };
}
