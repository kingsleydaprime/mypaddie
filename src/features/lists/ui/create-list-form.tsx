"use client";

import { useActionState } from "react";
import { createListAction, type ListFormState } from "../lists.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function CreateListForm() {
  const [state, action, pending] = useActionState<ListFormState, FormData>(createListAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null}>
      <summary className="cursor-pointer font-bold">+ New list</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input name="title" required maxLength={100} placeholder="e.g. Places to visit, Gift ideas" aria-label="List name" className={field} />
        <textarea name="items" rows={3} placeholder={"First items, one per line (optional)"} aria-label="First items" className={field} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noProgress" className="accent-[var(--gold)]" /> Just a list — no ticking off</label>
        {state?.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Creating…" : "Create"}</button>
      </form>
    </details>
  );
}
