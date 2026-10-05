"use client";

import { useActionState, useTransition, useState } from "react";
import { saveTaskAction, taskAction, type TaskFormState } from "../tasks.actions";

const field = "rounded-xl border border-line bg-surface px-4 py-3 text-base";

export interface TaskFormValues {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number | null;
  must: boolean;
  note: string;
  habit: boolean;
}

export function TaskForm({ task }: { task: TaskFormValues }) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(saveTaskAction, null);
  const [busy, start] = useTransition();
  const [other, setOther] = useState<TaskFormState>(null);
  const run = (a: "cancel" | "stop" | "delete") => start(async () => setOther(await taskAction(task.id, a)));
  const message = other ?? state;

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="habit" value={task.habit ? "1" : "0"} />
        <input name="title" defaultValue={task.title} required className={field} aria-label="Title" />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Date
            <input name="date" type="date" defaultValue={task.date} disabled={task.habit} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Time
            <input name="time" type="time" defaultValue={task.time} className={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Duration (minutes)
          <input name="duration" type="number" min={1} max={1440} defaultValue={task.duration ?? ""} placeholder="30" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Reminder note — what the notification should say
          <input name="note" maxLength={200} defaultValue={task.note} placeholder="e.g. Bring the signed form" className={field} />
        </label>
        <label className="flex items-center gap-3"><input type="checkbox" name="must" defaultChecked={task.must} className="h-5 w-5" /> Must-do (nudged until done)</label>
        <label className="flex items-center gap-3 text-sm text-muted"><input type="checkbox" name="force" className="h-5 w-5" /> Book it anyway if it overlaps something</label>
        {task.habit && <p className="text-xs text-muted">This is a daily/weekly habit: changes apply from this day on.</p>}
        {message && "error" in message && <p className="text-sm text-red" role="alert">{message.error}</p>}
        {message && "ok" in message && <p className="text-sm text-green" role="status">{message.ok}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <button type="button" disabled={busy} onClick={() => run("cancel")} className="rounded-xl border border-line px-4 py-3 text-left">
          Skip this one <span className="block text-xs text-muted">Cancelled on purpose — no XP lost.</span>
        </button>
        {task.habit && (
          <button type="button" disabled={busy} onClick={() => run("stop")} className="rounded-xl border border-line px-4 py-3 text-left">
            Stop this habit <span className="block text-xs text-muted">No new days; past ones stay as history.</span>
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => run("delete")} className="rounded-xl border border-red/40 px-4 py-3 text-left text-red">
          Delete <span className="block text-xs text-muted">For mistakes only — tasks with history can&apos;t be deleted.</span>
        </button>
      </div>
    </div>
  );
}
