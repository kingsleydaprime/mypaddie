"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DoneButton } from "@/features/today/ui/done-button";
import type { Step } from "../progress";
import { startTaskAction, tickStepAction } from "../tasks.actions";

function hm(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Earlier stretches plus the running one. */
function soFar(spent: number, startedAt: string | null): number {
  return spent + (startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 60_000)) : 0);
}

/**
 * Doing the task: start or stop it, and tick its checklist. Ticking the last
 * step only offers Done — some tasks have steps that aren't the whole thing.
 */
export function DoingPanel({ id, title, startedAt, spentMinutes, steps }: { id: string; title: string; startedAt: string | null; spentMinutes: number; steps: Step[] }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (f: () => Promise<{ error: string } | { ok: string } | null>) =>
    run(async () => {
      const r = await f();
      setError(r && "error" in r ? r.error : null);
      router.refresh();
    });
  const allDone = steps.length > 0 && steps.every((s) => s.done);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          {startedAt ? (
            <><span className="font-semibold text-gold">In progress</span> <span className="text-muted">· {hm(soFar(spentMinutes, startedAt))} · its reminders are quiet</span></>
          ) : spentMinutes > 0 ? (
            <><span className="font-semibold">Paused</span> <span className="text-muted">· {hm(spentMinutes)} so far</span></>
          ) : (
            <span className="text-muted">Not started</span>
          )}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => startTaskAction(id, startedAt !== null))}
          className={`shrink-0 rounded-xl px-4 py-2.5 font-semibold disabled:opacity-60 ${startedAt ? "border border-line" : "bg-gold text-on-gold"}`}
        >
          {startedAt ? "Pause" : spentMinutes > 0 ? "Resume" : "Start"}
        </button>
      </div>

      {steps.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-3">
          {steps.map((s, i) => (
            <li key={`${i}-${s.text}`}>
              <label className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={pending}
                  onChange={(e) => act(() => tickStepAction(id, i + 1, e.target.checked))}
                  className="h-5 w-5"
                />
                <span className={s.done ? "text-muted line-through" : ""}>{s.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {allDone && (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="font-semibold">All steps done — mark it done?</p>
          <DoneButton taskId={id} title={title} />
        </div>
      )}
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
    </section>
  );
}
