"use client";

import { useState, useTransition } from "react";
import type { QuitKind, QuitUnit } from "../quits";
import { logQuitAction } from "../quits.actions";
import { unitLabel } from "./labels";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const CAUSES = ["bored", "stressed", "lonely", "tired", "late night", "with friends", "after a fight"];

type Logged = Awaited<ReturnType<typeof logQuitAction>>;

/** The line shown after logging: firm, kind, short. Never a lecture. */
function afterLine(kind: QuitKind, unit: QuitUnit | null, res: Logged, longestBefore: number): string {
  if ("error" in res) return res.error;
  if (res.result !== "logged" || !res.quit) return "That quit isn't there any more.";
  const honest = res.honestyXp > 0 ? ` +${res.honestyXp} XP for being honest.` : "";
  if (kind === "quit") {
    const best = Math.max(longestBefore, res.quit.progress.longestDays);
    return `Logged. Back to day 0, and your best is still ${best} ${best === 1 ? "day" : "days"}. Start the next one now.${honest}`;
  }
  const t = res.quit.progress.today;
  if (!t) return `Logged.${honest}`;
  const u = unitLabel(unit, t.cap);
  return t.over
    ? `That's ${t.used}/${t.cap} ${u}: over today's cap. The streak starts again tomorrow, so make tomorrow the first.${honest}`
    : `Logged: ${t.used}/${t.cap} ${u} today. Still under.${honest}`;
}

/**
 * "I slipped" (quit) or "Log use" (cut down). It asks once before saving, with
 * when, what set it off and a note as optional extras. Only on the quit's page,
 * never on Home, so it can't be tapped by accident or seen over a shoulder.
 */
export function SlipButton({ id, kind, unit, longest }: { id: string; kind: QuitKind; unit: QuitUnit | null; longest: number }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  function submit(form: FormData) {
    const get = (k: string) => String(form.get(k) ?? "").trim() || null;
    start(async () => {
      const res = await logQuitAction(id, {
        at: get("at"),
        amount: kind === "limit" ? Number(get("amount")) : null,
        note: get("note"),
        cause: get("cause"),
      });
      const error = "error" in res;
      setLine({ text: afterLine(kind, unit, res, longest), error });
      if (!error) setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => { setOpen(true); setLine(null); }}
          className="rounded-xl border border-line px-4 py-3 font-semibold"
        >
          {kind === "quit" ? "I slipped" : "Log use"}
        </button>
        {line && <p className={`text-sm ${line.error ? "text-red" : ""}`} role="status">{line.text}</p>}
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <p className="font-semibold">
        {kind === "quit" ? "Log a slip?" : "How much?"}
      </p>
      {kind === "quit" ? (
        <p className="-mt-2 text-sm text-muted">The count goes back to day 0. Your best and your XP stay.</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <input name="amount" type="number" inputMode="numeric" min={1} max={100000} required autoFocus className={field} aria-label={unit === "minutes" ? "Minutes" : "Times"} />
          <span className="text-sm text-muted">{unit === "minutes" ? "minutes" : "times"}</span>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-muted">When, what set it off, a note</summary>
        <div className="mt-2 flex flex-col gap-2">
          <input name="at" type="datetime-local" className={field} aria-label="When (leave empty for now)" />
          <input name="cause" list="quit-causes" maxLength={40} placeholder="What set it off? e.g. bored" className={field} aria-label="What set it off (optional)" />
          <datalist id="quit-causes">{CAUSES.map((c) => <option key={c} value={c} />)}</datalist>
          <textarea name="note" maxLength={500} rows={2} placeholder="A note for yourself (optional)" className={field} aria-label="Note (optional)" />
        </div>
      </details>
      {line?.error && <p className="text-sm text-red" role="alert">{line.text}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="flex-1 rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold disabled:opacity-60">
          {pending ? "Saving…" : "Log it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-line px-4 py-2.5 text-muted">Cancel</button>
      </div>
    </form>
  );
}
