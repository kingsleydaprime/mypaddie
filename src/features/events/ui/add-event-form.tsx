"use client";

import { useActionState, useState } from "react";
import { EVENT_KINDS } from "../events";
import { addEventAction, type EventFormState } from "../events.actions";

const field = "rounded-xl border border-line bg-surface px-4 py-3 text-base";

export function AddEventForm() {
  // Bumped after each successful add so the form remounts empty.
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState<EventFormState, FormData>(async (prev, form) => {
    const next = await addEventAction(prev, form);
    if (next && "ok" in next) setFormKey((k) => k + 1);
    return next;
  }, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null && "error" in state}>
      <summary className="cursor-pointer font-bold">+ Add event</summary>
      <form action={action} className="mt-3 flex flex-col gap-3" key={formKey}>
        <input name="title" required placeholder="What is it?" className={field} />
        <select name="kind" defaultValue="other" className={field} aria-label="Kind">
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-3 flex flex-col gap-1 text-sm text-muted sm:col-span-1">Date<input name="date" type="date" required className={field} /></label>
          <label className="flex flex-col gap-1 text-sm text-muted">From<input name="start_time" type="time" className={field} /></label>
          <label className="flex flex-col gap-1 text-sm text-muted">To<input name="end_time" type="time" className={field} /></label>
        </div>
        <p className="-mt-1 text-xs text-muted">No time = all day. Birthdays and anniversaries repeat every year.</p>
        <input name="person" placeholder="Whose? (birthdays, anniversaries)" className={field} />
        <input name="reminder_note" maxLength={200} placeholder="Reminder note, e.g. Buy flowers on the way" className={field} />
        <label className="flex items-center gap-3"><input type="checkbox" name="important" className="h-5 w-5" /> Important</label>
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        {state && "ok" in state && <p className="text-sm text-green" role="status">{state.ok}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">{pending ? "Adding…" : "Add event"}</button>
      </form>
    </details>
  );
}
