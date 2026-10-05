"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeTaskAction } from "../today.actions";

export function DoneButton({ taskId, title }: { taskId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState<string | null>(null);

  const done = () =>
    startTransition(async () => {
      const result = await completeTaskAction(taskId);
      if (result.result === "completed") {
        setLabel(`+${result.xp} XP${result.late ? " · late still counts" : ""}`);
      } else {
        setLabel(result.result === "already_done" ? "Already done" : "Couldn't complete");
      }
      // Let the reward register, then pull the next thing up.
      setTimeout(() => router.refresh(), 900);
    });

  if (label) {
    return <span className="shrink-0 rounded-xl px-3 py-3 text-sm font-semibold text-gold" role="status">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={done}
      disabled={pending}
      aria-label={`Mark "${title}" done`}
      className="shrink-0 rounded-xl bg-gold px-5 py-3 text-base font-semibold text-on-gold active:scale-95 disabled:opacity-60"
    >
      {pending ? "…" : "Done"}
    </button>
  );
}
