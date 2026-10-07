import type { Db } from "@/shared/supabase/token-client";
import { cancelOnUndo, kindOfTask, type UndoKind } from "./undo";

/** How far back the "recent" list looks. Older mistakes are better fixed by hand. */
const RECENT_HOURS = 48;

export interface Undoable {
  kind: UndoKind;
  id: string;
  title: string;
  at: string;
}

/** Recently done tasks (fun and workouts included) and learning sessions, newest first. */
export async function recentUndoable(db: Db, now: Date, kind?: UndoKind, limit = 8): Promise<Undoable[]> {
  const since = new Date(now.getTime() - RECENT_HOURS * 3_600_000).toISOString();
  const [tasks, sessions] = await Promise.all([
    kind === "learning"
      ? Promise.resolve({ data: [], error: null })
      : db.from("tasks").select("id, title, done_at, fun_activity_id, workout_logs(id)").eq("status", "done").gte("done_at", since).order("done_at", { ascending: false }).limit(30),
    kind && kind !== "learning"
      ? Promise.resolve({ data: [], error: null })
      // Practice logged by completing a task goes with that task, not on its own.
      : db.from("learning_sessions").select("id, topic, minutes, at, skills(name)").gte("at", since).not("notes", "like", "From task:%").order("at", { ascending: false }).limit(30),
  ]);
  if (tasks.error) throw new Error(`loading recent tasks: ${tasks.error.message}`);
  if (sessions.error) throw new Error(`loading recent learning: ${sessions.error.message}`);

  const fromTasks: Undoable[] = (tasks.data ?? []).map((t) => ({
    kind: kindOfTask({ funActivityId: t.fun_activity_id, hasWorkoutLog: (t.workout_logs ?? []).length > 0 }),
    id: t.id,
    title: t.title,
    at: t.done_at!,
  }));
  const fromLearning: Undoable[] = (sessions.data ?? []).map((s) => ({
    kind: "learning",
    id: s.id,
    title: `${s.skills?.name ?? "Learning"}${s.topic ? `: ${s.topic}` : ""} (${s.minutes} min)`,
    at: s.at,
  }));
  return [...fromTasks.filter((u) => !kind || u.kind === kind), ...fromLearning]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}

export type UndoResult =
  | { result: "undone" | "cancelled"; title: string; xp: number }
  | { result: "undone"; minutes: number; topic: string | null; xp: number }
  | { result: "not_found" | "not_done"; status?: string };

/** Undo a done task: XP reversed, side effects rolled back; logged-after-the-fact tasks are cancelled. */
export async function undoTask(db: Db, taskId: string): Promise<UndoResult> {
  const { data: t, error } = await db.from("tasks").select("due_at, series_id, created_at, done_at").eq("id", taskId).maybeSingle();
  if (error) throw new Error(`loading the task: ${error.message}`);
  if (!t) return { result: "not_found" };
  const cancel = cancelOnUndo({
    dueAt: t.due_at ? new Date(t.due_at) : null,
    seriesId: t.series_id,
    createdAt: new Date(t.created_at),
    doneAt: t.done_at ? new Date(t.done_at) : null,
  });
  const { data, error: rpcError } = await db.rpc("undo_task", { p_task_id: taskId, p_cancel: cancel });
  if (rpcError) throw new Error(`undoing the task: ${rpcError.message}`);
  return data as UndoResult;
}

export async function undoLearning(db: Db, sessionId: string): Promise<UndoResult> {
  const { data, error } = await db.rpc("undo_learning", { p_session_id: sessionId });
  if (error) throw new Error(`undoing the session: ${error.message}`);
  return data as UndoResult;
}

export async function undo(db: Db, kind: UndoKind, id: string): Promise<UndoResult> {
  return kind === "learning" ? undoLearning(db, id) : undoTask(db, id);
}
