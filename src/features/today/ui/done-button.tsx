"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeTaskAction } from "../today.actions";

/** `wide`: fills its share of a button row instead of sitting at the end of one. */
export function DoneButton({ taskId, title, wide = false }: { taskId: string; title: string; wide?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState<string | null>(null);

  const done = () =>
    startTransition(async () => {
      const result = await completeTaskAction(taskId);
      if (result.result === "completed") {
        const took = result.tookMinutes !== undefined ? ` · took ${result.tookMinutes >= 60 ? `${Math.floor(result.tookMinutes / 60)}h ${String(result.tookMinutes % 60).padStart(2, "0")}m` : `${result.tookMinutes}m`}` : "";
        setLabel(`+${result.xp} XP${result.late ? " · late still counts" : ""}${took}`);
      } else {
        setLabel(result.result === "already_done" ? "Already done" : "Couldn't complete");
      }
      // Let the reward register, then pull the next thing up.
      setTimeout(() => router.refresh(), 900);
    });

  if (label) {
    return <span className={`${wide ? "flex-1 text-center" : "shrink-0"} rounded-xl px-3 py-3 text-sm font-semibold text-gold`} role="status">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={done}
      disabled={pending}
      aria-label={`Mark "${title}" done`}
      className={`${wide ? "flex-1" : "shrink-0"} rounded-xl bg-gold px-5 py-3 text-base font-semibold text-on-gold active:scale-95 disabled:opacity-60`}
    >
      {pending ? "…" : "Done"}
    </button>
  );
}
