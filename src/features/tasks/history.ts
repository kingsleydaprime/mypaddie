import { lateAfter, type TaskStatus } from "@/features/xp/xp";
import type { EngineConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";

export type TaskHistoryFilter = TaskStatus | "slipped" | "late";

export interface TaskHistoryRow {
  id: string;
  title: string;
  status: TaskStatus;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
  occurs_on: string | null;
  duration_minutes: number | null;
  routine_step: number | null;
  routines: { title: string } | null;
}

export interface TaskHistorySlip {
  why: string | null;
  why_category: string | null;
  accepted: boolean;
  at: string;
}

export interface TaskHistoryMiss {
  reason: string;
  at: string;
  self_reported: boolean;
}

export function taskHistoryRecord(
  task: TaskHistoryRow,
  slips: readonly TaskHistorySlip[],
  miss: TaskHistoryMiss | null,
  timeZone: string,
  dayEndsAt: string,
  config: EngineConfig,
) {
  const dueAt = task.due_at ? new Date(task.due_at) : null;
  const doneAt = task.done_at ? new Date(task.done_at) : null;
  const lateAt = lateAfter(dueAt, task.duration_minutes, config, { occursOn: task.occurs_on, dayEndsAt });
  const late = task.status === "done" && doneAt !== null && lateAt !== null && doneAt.getTime() > lateAt.getTime();
  const outcomes: TaskHistoryFilter[] = [];
  if (task.status === "done" || task.status === "missed") outcomes.push(task.status);
  if (slips.length > 0) outcomes.push("slipped");
  if (late) outcomes.push("late");

  const date = task.occurs_on ?? (dueAt ? dayKey(dueAt, timeZone) : doneAt ? dayKey(doneAt, timeZone) : dayKey(new Date(task.created_at), timeZone));
  return {
    task_id: task.id,
    title: task.title,
    date,
    status: task.status,
    outcomes,
    due_at: task.due_at,
    done_at: task.done_at,
    late,
    routine_step: task.routine_step,
    routine: task.routines?.title ?? null,
    miss: miss ? { reason: miss.reason, at: miss.at, self_reported: miss.self_reported } : null,
    slips: slips.map((slip) => ({ why: slip.why, why_category: slip.why_category, accepted: slip.accepted, at: slip.at })),
  };
}

export function matchesTaskHistoryStatus(
  record: ReturnType<typeof taskHistoryRecord>,
  status: TaskHistoryFilter | undefined,
): boolean {
  if (!status) return true;
  if (status === "slipped" || status === "late") return record.outcomes.includes(status);
  return record.status === status;
}
