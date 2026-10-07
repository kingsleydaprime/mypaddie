"use client";

import { useActionState } from "react";
import { RELATIONS } from "../people";
import { addPersonAction, type PersonFormState } from "../people.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function AddPersonForm() {
  const [state, action, pending] = useActionState<PersonFormState, FormData>(addPersonAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null && "error" in state}>
      <summary className="cursor-pointer font-bold">+ Add someone</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <input name="name" required maxLength={100} placeholder="Name" aria-label="Name" className={field} />
          <select name="relation" defaultValue="friend" aria-label="Relation" className={field}>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <input name="who" maxLength={200} placeholder="What they are to you, e.g. my sister, my manager" aria-label="What they are to you" className={field} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Birthday<input name="birthday" type="date" className={field} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Reach out every (days)<input name="every" type="number" min={1} max={730} placeholder="e.g. 7" className={field} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" className="accent-[var(--gold)]" /> Close to me</label>
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Add"}</button>
      </form>
    </details>
  );
}
