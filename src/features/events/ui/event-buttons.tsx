"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelEventFromTodayAction, finishEventAction, missEventAction, startEventFromTodayAction } from "../events.actions";

const SECONDARY = "rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-60";
const MENU_ITEM = "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-60";

/**
 * The row under an event on Home: Start (when it can be started early) and
 * Done, with Missed and Cancel behind ⋯. All-day and yearly events (a
 * birthday) aren't started or finished, only cancelled.
 */
export function EventButtons({ eventId, title, startable, happening }: { eventId: string; title: string; startable: boolean; happening: boolean }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [menu, setMenu] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<string | null>) =>
    run(async () => {
      const text = await fn();
      if (text) {
        setOutcome(text);
        setTimeout(() => router.refresh(), 900);
      } else router.refresh();
    });

  const start = () =>
    act(async () => {
      const r = await startEventFromTodayAction(eventId);
      if (r.result === "started") return null;
      setError(r.result === "over" ? "It's already over." : r.result === "already_in_progress" ? "It's already on." : "It can't be started.");
      return null;
    });
  const done = () => act(async () => (await finishEventAction(eventId, "done"), "Done — well handled"));
  const missed = () =>
    act(async () => {
      const r = await missEventAction(eventId);
      if (r.result === "recorded") return "Missed — noted, honesty counts";
      setError(r.result === "already_missed" ? "Already marked missed" : "Couldn't mark it missed");
      return null;
    });
  const cancel = () => act(async () => (await cancelEventFromTodayAction(eventId), "Cancelled"));

  if (outcome) return <p className="mt-3 text-sm font-semibold text-muted" role="status">{outcome}</p>;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        {startable && !happening && (
          <button type="button" onClick={start} disabled={pending} aria-label={`Start "${title}"`} className={`flex-1 ${SECONDARY}`}>Start</button>
        )}
        {startable && (
          <button type="button" onClick={done} disabled={pending} aria-label={`Finish "${title}"`} className="flex-1 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold shadow-sm disabled:opacity-60">
            {pending && !menu ? "…" : "Done"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label={`More for "${title}"`}
          className={`${SECONDARY} ${startable ? "" : "ml-auto"} px-3 text-muted ${menu ? "bg-surface-2" : ""}`}
        >
          ⋯
        </button>
      </div>
      {menu && (
        <div className="flex flex-col rounded-xl border border-line bg-surface p-1">
          {startable && (
            <button type="button" onClick={missed} disabled={pending} className={`${MENU_ITEM} text-red`}>
              <span className="font-semibold">Missed it</span>
              <span className="text-xs text-muted">You were meant to be there. Costs XP; owning it earns some back.</span>
            </button>
          )}
          <button type="button" onClick={cancel} disabled={pending} className={MENU_ITEM}>
            <span className="font-semibold">Cancel</span>
            <span className="text-xs text-muted">Called off or not happening. No XP either way.</span>
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
    </div>
  );
}
