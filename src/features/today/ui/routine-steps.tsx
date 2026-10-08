"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { undoAction } from "@/features/undo/undo.actions";
import { completeTaskAction } from "../today.actions";

export interface RoutineStep {
  id: string;
  title: string;
  done: boolean;
}

/**
 * Today's steps of a routine, each ticked on its own and in any order (same
 * engine and XP as Done). Tapping a ticked step undoes it.
 */
export function RoutineSteps({ steps }: { steps: RoutineStep[] }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = (s: RoutineStep) => {
    setBusy(s.id);
    run(async () => {
      if (s.done) {
        const form = new FormData();
        form.set("kind", "task");
        form.set("id", s.id);
        const r = await undoAction(null, form);
        setNote(r && "error" in r ? r.error : `${s.title}: undone.`);
      } else {
        const r = await completeTaskAction(s.id);
        setNote(r.result === "completed" ? `${s.title} · +${r.xp} XP${r.late ? " · late still counts" : ""}` : r.result === "already_done" ? "Already done" : "Couldn't complete");
      }
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-2">
      <ul className="flex flex-col">
        {steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => toggle(s)}
              disabled={pending}
              role="checkbox"
              aria-checked={s.done}
              className="flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm disabled:opacity-60"
            >
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${s.done ? "border-gold bg-gold text-on-gold" : "border-line"}`}
              >
                {busy === s.id ? "…" : s.done ? "✓" : ""}
              </span>
              <span className={s.done ? "text-muted line-through" : ""}>{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm text-gold" role="status">{note}</p>}
    </div>
  );
}
