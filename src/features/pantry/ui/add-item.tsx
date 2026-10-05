"use client";

import { useActionState, useState } from "react";
import { CATEGORIES, COMMON_UNITS } from "../pantry";
import { saveItemAction, type PantryFormState } from "../pantry.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function AddPantryItem() {
  const [key, setKey] = useState(0);
  const [state, action, pending] = useActionState<PantryFormState, FormData>(async (prev, form) => {
    const next = await saveItemAction(prev, form);
    if (next && "ok" in next) setKey((k) => k + 1);
    return next;
  }, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">+ Add item</summary>
      <form key={key} action={action} className="mt-3 grid grid-cols-2 gap-2">
        <input name="name" required placeholder="What? e.g. Rice" className={`${field} col-span-2`} />
        <input name="quantity" type="number" step="any" min={0} required placeholder="How much" className={field} />
        <input name="unit" list="pantry-units" required placeholder="Unit" className={field} />
        <datalist id="pantry-units">{COMMON_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        <select name="category" defaultValue="other" className={field} aria-label="Category">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="low_at" type="number" step="any" min={0} placeholder="Low at (optional)" className={field} />
        {state && "error" in state && <p className="col-span-2 text-sm text-red" role="alert">{state.error}</p>}
        {state && "ok" in state && <p className="col-span-2 text-sm text-green" role="status">Added.</p>}
        <button disabled={pending} className="col-span-2 rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Adding…" : "Add"}</button>
      </form>
    </details>
  );
}
