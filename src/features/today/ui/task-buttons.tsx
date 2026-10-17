"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startTaskAction } from "@/features/tasks/tasks.actions";
import { missTaskAction } from "../today.actions";
import { DoneButton } from "./done-button";

/**
 * The row under a task: Start (or Pause / Resume) beside Done and Miss. Starting while
 * another task is running is refused — the reason shows under the buttons.
 */
export function TaskButtons({ taskId, title, running, spentMinutes }: { taskId: string; title: string; running: boolean; spentMinutes: number }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const label = running ? "Pause" : spentMinutes > 0 ? "Resume" : "Start";

  const toggle = () =>
    run(async () => {
      const r = await startTaskAction(taskId, running);
      setError(r && "error" in r ? r.error : null);
      router.refresh();
    });

  const markMissed = () =>
    run(async () => {
      const r = await missTaskAction(taskId);
      if (r.result === "recorded") {
        setMissed(true);
        setTimeout(() => router.refresh(), 900);
      } else {
        setError(r.result === "already_missed" ? "Already marked missed" : "Couldn't mark missed");
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || missed}
          aria-label={`${label} "${title}"`}
          className="flex-1 rounded-xl border border-line px-3 py-3 text-base font-semibold active:scale-95 disabled:opacity-60"
        >
          {pending && !missed ? "…" : label}
        </button>
        <DoneButton taskId={taskId} title={title} wide />
        <button
          type="button"
          onClick={markMissed}
          disabled={pending || missed}
          aria-label={`Mark "${title}" missed`}
          className="rounded-xl border border-line px-3 py-3 text-sm font-semibold text-muted hover:border-red/40 hover:text-red active:scale-95 disabled:opacity-60"
        >
          {missed ? "Missed" : "Miss"}
        </button>
      </div>
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
    </div>
  );
}
