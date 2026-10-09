"use client";

import type { Step } from "@/features/tasks/progress";
import { tickStepAction } from "@/features/tasks/tasks.actions";
import { TickList } from "./tick-list";

/**
 * A task's checklist on its card, ticked the same way as on the task's page.
 * Steps are for you, not for points: Done still finishes the task.
 */
export function ChecklistSteps({ taskId, steps }: { taskId: string; steps: Step[] }) {
  return (
    <TickList
      items={steps.map((s, i) => ({ key: `${i}-${s.text}`, title: s.text, done: s.done }))}
      onToggle={async (s, i) => {
        const r = await tickStepAction(taskId, i + 1, !s.done);
        if (r && "error" in r) return r.error;
        return r && "ok" in r && r.ok === "all_done" ? "All steps done — tap Done when the task is." : null;
      }}
    />
  );
}
