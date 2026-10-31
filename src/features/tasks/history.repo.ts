import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, zonedInstant } from "@/shared/time";
import { matchesTaskHistoryStatus, taskHistoryRecord, type TaskHistoryFilter, type TaskHistoryRow } from "./history";

export type TaskHistoryRecord = ReturnType<typeof taskHistoryRecord>;

/**
 * Task occurrences in an inclusive local-date range, oldest first. A stored
 * status (pending, done…) filters in the query, so pages stay full; "slipped"
 * and "late" are outcomes, filtered after.
 */
export async function loadTaskHistory(
  db: Db,
  args: { from: string; to: string; status?: TaskHistoryFilter; limit: number; offset: number; newestFirst?: boolean },
  config = currentConfig(),
): Promise<{ tasks: TaskHistoryRecord[]; nextOffset: number | null }> {
  const schedule = await loadSchedule(db);
  const start = zonedInstant(args.from, "00:00", config.timeZone).toISOString();
  const end = zonedInstant(addDays(args.to, 1), "00:00", config.timeZone).toISOString();
  const dateFilter = [
    `and(occurs_on.gte.${args.from},occurs_on.lte.${args.to})`,
    `and(occurs_on.is.null,due_at.gte.${start},due_at.lt.${end})`,
    `and(occurs_on.is.null,due_at.is.null,done_at.gte.${start},done_at.lt.${end})`,
    `and(occurs_on.is.null,due_at.is.null,done_at.is.null,created_at.gte.${start},created_at.lt.${end})`,
  ].join(",");
  const ascending = !args.newestFirst;
  let query = db
    .from("tasks")
    .select("id, title, status, due_at, done_at, created_at, occurs_on, duration_minutes, routine_step, routines(title)")
    .or(dateFilter);
  if (args.status && args.status !== "slipped" && args.status !== "late") query = query.eq("status", args.status);
  const { data: tasks, error } = await query
    .order("occurs_on", { ascending, nullsFirst: ascending })
    .order("due_at", { ascending, nullsFirst: ascending })
    .order("created_at", { ascending })
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);
  if (error) throw new Error(`loading task history: ${error.message}`);

  const rows = (tasks ?? []) as unknown as TaskHistoryRow[];
  const ids = rows.map((task) => task.id);
  const [slipResult, missResult] = ids.length
    ? await Promise.all([
        db.from("slips").select("task_id, why, why_category, accepted, at").in("task_id", ids).order("at", { ascending: true }),
        db.from("missed_tasks").select("task_id, reason, at, self_reported").in("task_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (slipResult.error) throw new Error(`loading slips: ${slipResult.error.message}`);
  if (missResult.error) throw new Error(`loading miss reasons: ${missResult.error.message}`);

  const slipsByTask = new Map<string, NonNullable<typeof slipResult.data>>();
  for (const slip of slipResult.data ?? []) {
    slipsByTask.set(slip.task_id, [...(slipsByTask.get(slip.task_id) ?? []), slip]);
  }
  const missesByTask = new Map((missResult.data ?? []).filter((miss) => miss.task_id).map((miss) => [miss.task_id!, miss]));
  const records = rows
    .map((task) => taskHistoryRecord(task, slipsByTask.get(task.id) ?? [], missesByTask.get(task.id) ?? null, config.timeZone, dayEndsAt(schedule), config))
    .filter((record) => matchesTaskHistoryStatus(record, args.status));
  return { tasks: records, nextOffset: rows.length === args.limit ? args.offset + rows.length : null };
}
