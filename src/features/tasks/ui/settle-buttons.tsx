"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelTaskAction, completeTaskAction, missTaskAction } from "@/features/today/today.actions";

const QUIET = "rounded-full px-3 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60";

/**
 * Settle a task left open on a past day: Done, Missed or Cancel. Cancel only
 * ever drops this one day — a habit keeps running (stopping one is Tasks' job).
 */
export function SettleButtons({ taskId, title }: { taskId: string; title: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [outcome, setOutcome] = useState<{ text: string; tone: "gold" | "red" | "muted" } | null>(null);

  const settle = (text: string, tone: "gold" | "red" | "muted") => {
    setOutcome({ text, tone });
    setTimeout(() => router.refresh(), 1100);
  };

  const done = () =>
    run(async () => {
      const r = await completeTaskAction(taskId);
      if (r.result === "completed") settle(`+${r.xp} XP${r.late ? " · late still counts" : ""}`, "gold");
      else settle(r.result === "already_done" ? "Already done" : "Couldn't complete it", "muted");
    });

  const missed = () =>
    run(async () => {
      const r = await missTaskAction(taskId);
      settle(r.result === "recorded" ? "Missed · owning it counts" : r.result === "already_missed" ? "Already missed" : "Couldn't mark it", "red");
    });

  const cancel = () =>
    run(async () => {
      const r = await cancelTaskAction(taskId, false);
      settle(r.result === "failed" ? "Couldn't cancel it" : "Let go", "muted");
    });

  if (outcome) {
    const color = outcome.tone === "gold" ? "text-gold" : outcome.tone === "red" ? "text-red" : "text-muted";
    return <p className={`mt-2 text-xs font-semibold ${color}`} role="status">{outcome.text}</p>;
  }

  return (
    <div className="mt-2 flex items-center gap-1">
      <button type="button" onClick={done} disabled={pending} aria-label={`Mark "${title}" done`} className="rounded-full border border-gold/50 px-3 py-1 text-xs font-semibold text-gold transition-colors hover:bg-gold hover:text-on-gold disabled:opacity-60">
        {pending ? "…" : "Done"}
      </button>
      <button type="button" onClick={missed} disabled={pending} aria-label={`Mark "${title}" missed`} className={QUIET}>Missed</button>
      <button type="button" onClick={cancel} disabled={pending} aria-label={`Cancel "${title}"`} className={QUIET}>Cancel</button>
    </div>
  );
}
