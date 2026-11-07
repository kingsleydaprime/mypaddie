"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { startQuitAction, type QuitFormState } from "../quits.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function StartQuitForm({ open = false }: { open?: boolean }) {
  const [state, action, pending] = useActionState<QuitFormState, FormData>(startQuitAction, null);
  const [kind, setKind] = useState<"quit" | "limit">("quit");
  const router = useRouter();
  useEffect(() => {
    if (state && "ok" in state) router.push(`/app/quits/${state.id}`);
  }, [state, router]);

  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={open || (state !== null && "error" in state)}>
      <summary className="cursor-pointer font-bold">+ Quit or cut down something</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input name="title" required maxLength={80} placeholder="What is it? e.g. Smoking" className={field} aria-label="What you're quitting" />
        <input name="alias" maxLength={40} placeholder="A private name (optional), e.g. Project P" className={field} aria-label="A private name (optional)" />
        <p className="-mt-2 text-xs text-muted">With a private name, that&apos;s what the app shows, and all Paddie sees.</p>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Quit or cut down</legend>
          {(["quit", "limit"] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-semibold ${kind === k ? "border-gold text-gold" : "border-line text-muted"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "quit" ? "Quit completely" : "Cut down"}
            </label>
          ))}
        </fieldset>

        {kind === "limit" && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input name="limit" type="number" inputMode="numeric" min={1} max={100000} required placeholder="At most" className={field} aria-label="Daily cap" />
            <select name="unit" defaultValue="minutes" className={field} aria-label="Unit">
              <option value="minutes">minutes a day</option>
              <option value="times">times a day</option>
            </select>
          </div>
        )}

        <textarea name="why" maxLength={300} rows={2} placeholder="Why? (optional) — you'll see it when it's hard" className={field} aria-label="Why you're doing this (optional)" />
        <label className="flex flex-col gap-1 text-sm text-muted">
          Stopped already? When
          <input name="started_at" type="date" className={field} aria-label="Started on (leave empty for now)" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="on_home" type="checkbox" className="h-5 w-5" />
          Show the day count on Home
        </label>
        <p className="text-xs text-muted">
          {kind === "quit"
            ? "A slip sends the count back to day 0 and costs nothing: your best and your XP stay. Logging it honestly earns +2."
            : "A day only counts against you if it goes over the cap. Raising the cap later starts a new attempt; lowering it doesn't."}{" "}
          Milestones from day 1 to day 365 earn XP, again on every attempt.
        </p>
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Starting…" : "Start"}</button>
      </form>
    </details>
  );
}
