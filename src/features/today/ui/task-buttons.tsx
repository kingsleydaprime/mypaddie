"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startTaskAction } from "@/features/tasks/tasks.actions";
import { cancelTaskAction, missTaskAction, skipTaskAction } from "../today.actions";
import { DoneButton } from "./done-button";

const SECONDARY = "rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-60";
const MENU_ITEM = "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-60";

/**
 * The row under a task: Start (or Pause / Resume) and Done, with the rest
 * behind ⋯ — Skip, Miss, and Cancel (or Stop, for a habit). Skipping a must-do
 * asks why in a line first. Starting while another task is running is refused;
 * the reason shows under the buttons.
 */
export function TaskButtons({ taskId, title, running, spentMinutes, mustDo, habit, routine = false }: {
  taskId: string;
  title: string;
  running: boolean;
  spentMinutes: number;
  mustDo: boolean;
  habit: boolean;
  /** A routine's step: skip or miss the step; the routine itself is stopped from Routines. */
  routine?: boolean;
}) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [panel, setPanel] = useState<"closed" | "menu" | "why" | "stop">("closed");
  const [why, setWhy] = useState("");
  const label = running ? "Pause" : spentMinutes > 0 ? "Resume" : "Start";

  // Let the outcome register, then pull the next thing up.
  const settle = (text: string) => {
    setOutcome(text);
    setPanel("closed");
    setTimeout(() => router.refresh(), 900);
  };

  const toggle = () =>
    run(async () => {
      const r = await startTaskAction(taskId, running);
      setError(r && "error" in r ? r.error : null);
      router.refresh();
    });

  const markMissed = () =>
    run(async () => {
      const r = await missTaskAction(taskId);
      if (r.result === "recorded") settle("Missed — noted, honesty counts");
      else setError(r.result === "already_missed" ? "Already marked missed" : "Couldn't mark missed");
    });

  const skip = () =>
    run(async () => {
      const r = await skipTaskAction(taskId, why);
      if (r.result === "needs_reason") return setPanel("why");
      if (r.result === "skipped") return settle("excuse" in r ? "Skipped — same reason again, so it counts" : "Skipped — no XP lost");
      setError(r.result === "already_done" ? "It's already done" : "Couldn't skip it");
    });

  const cancel = () =>
    run(async () => {
      const r = await cancelTaskAction(taskId, habit);
      if (r.result === "failed") setError("Couldn't cancel it");
      else settle(r.result === "stopped" ? "Habit stopped" : "Cancelled");
    });

  if (outcome) return <p className="mt-3 text-sm font-semibold text-muted" role="status">{outcome}</p>;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" onClick={toggle} disabled={pending} aria-label={`${label} "${title}"`} className={`flex-1 ${SECONDARY}`}>
          {pending && panel === "closed" ? "…" : label}
        </button>
        <DoneButton taskId={taskId} title={title} wide />
        <button
          type="button"
          onClick={() => setPanel(panel === "closed" ? "menu" : "closed")}
          aria-expanded={panel !== "closed"}
          aria-label={`More for "${title}"`}
          className={`${SECONDARY} px-3 text-muted ${panel !== "closed" ? "bg-surface-2" : ""}`}
        >
          ⋯
        </button>
      </div>

      {panel === "menu" && (
        <div className="flex flex-col rounded-xl border border-line bg-surface p-1">
          <button type="button" onClick={mustDo ? () => setPanel("why") : skip} disabled={pending} className={MENU_ITEM}>
            <span className="font-semibold">Skip {habit ? "today" : "this"}</span>
            <span className="text-xs text-muted">{mustDo ? "A must-do: say why in a line. No XP lost." : "On purpose, no XP lost."}</span>
          </button>
          <button type="button" onClick={markMissed} disabled={pending} className={`${MENU_ITEM} text-red`}>
            <span className="font-semibold">Missed it</span>
            <span className="text-xs text-muted">Costs XP, but owning it earns some back.</span>
          </button>
          {!routine && (
            <button type="button" onClick={habit ? () => setPanel("stop") : cancel} disabled={pending} className={MENU_ITEM}>
              <span className="font-semibold">{habit ? "Stop this habit" : "Cancel task"}</span>
              <span className="text-xs text-muted">{habit ? "No new days; past ones stay as history." : "Not doing it at all."}</span>
            </button>
          )}
        </div>
      )}

      {panel === "why" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            skip();
          }}
          className="flex gap-2"
        >
          <input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            maxLength={300}
            required
            autoFocus
            placeholder="Why skip it? One line"
            aria-label="Why are you skipping it?"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={pending || !why.trim()} className={SECONDARY}>{pending ? "…" : "Skip"}</button>
        </form>
      )}

      {panel === "stop" && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <span className="text-sm">Stop &ldquo;{title}&rdquo; for good?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setPanel("menu")} className="rounded-lg px-2 py-1 text-sm text-muted">Back</button>
            <button type="button" onClick={cancel} disabled={pending} className="rounded-lg border border-red/40 px-2.5 py-1 text-sm font-semibold text-red">{pending ? "…" : "Stop it"}</button>
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red" role="alert">{error}</p>}
    </div>
  );
}
