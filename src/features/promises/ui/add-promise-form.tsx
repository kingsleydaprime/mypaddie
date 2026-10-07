"use client";

import { useActionState } from "react";
import { addPromiseAction, type PromiseFormState } from "../promises.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function AddPromiseForm() {
  const [state, action, pending] = useActionState<PromiseFormState, FormData>(addPromiseAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null && "error" in state}>
      <summary className="cursor-pointer font-bold">+ Add a promise</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input name="person" required maxLength={100} placeholder="To whom? e.g. Ada" className={field} aria-label="To whom" />
        <input name="what" required maxLength={300} placeholder="What? e.g. Send the lecture notes" className={field} aria-label="What you promised" />
        <div className="grid grid-cols-2 gap-2">
          <input name="date" type="date" className={field} aria-label="By when (leave empty for no deadline)" />
          <input name="time" type="time" className={field} aria-label="Time (optional)" />
        </div>
        <p className="text-xs text-muted">Kept on its day: +15 XP. Broken: −15, and keeping it later earns back only half. Can&apos;t make it? Tell them before the day ends and move the date.</p>
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        {state && "ok" in state && state.message && <p className="text-sm text-muted" role="status">{state.message}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      </form>
    </details>
  );
}
