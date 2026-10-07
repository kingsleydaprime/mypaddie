/**
 * What an undo should leave behind. A task that only existed to record
 * something after the fact — log_fun, an off-plan log_workout, created and
 * completed in the same moment with no date or repeat — is cancelled, so no
 * phantom "Fun: football" sits on the list as pending. Anything that was
 * planned goes back to pending, ready to be done for real.
 */
export interface TaskForUndo {
  dueAt: Date | null;
  seriesId: string | null;
  createdAt: Date;
  doneAt: Date | null;
}

/** How close creation and completion must be to count as "logged after the fact". */
export const LOGGED_AFTER_THE_FACT_MS = 2 * 60_000;

export function cancelOnUndo(task: TaskForUndo): boolean {
  if (task.dueAt !== null || task.seriesId !== null || task.doneAt === null) return false;
  return task.doneAt.getTime() - task.createdAt.getTime() <= LOGGED_AFTER_THE_FACT_MS;
}

/** What a done task was, so the "is this the one?" list reads naturally. */
export type UndoKind = "task" | "fun" | "workout" | "learning" | "slip";

export function kindOfTask(t: { funActivityId: string | null; hasWorkoutLog: boolean }): UndoKind {
  if (t.funActivityId) return "fun";
  if (t.hasWorkoutLog) return "workout";
  return "task";
}
