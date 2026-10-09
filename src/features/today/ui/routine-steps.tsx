"use client";

import { undoAction } from "@/features/undo/undo.actions";
import { completeTaskAction } from "../today.actions";
import { TickList } from "./tick-list";

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
  return (
    <TickList
      items={steps.map((s) => ({ key: s.id, title: s.title, done: s.done }))}
      onToggle={async (s) => {
        if (s.done) {
          const form = new FormData();
          form.set("kind", "task");
          form.set("id", s.key);
          const r = await undoAction(null, form);
          return r && "error" in r ? r.error : `${s.title}: undone.`;
        }
        const r = await completeTaskAction(s.key);
        return r.result === "completed" ? `${s.title} · +${r.xp} XP${r.late ? " · late still counts" : ""}` : r.result === "already_done" ? "Already done" : "Couldn't complete";
      }}
    />
  );
}
