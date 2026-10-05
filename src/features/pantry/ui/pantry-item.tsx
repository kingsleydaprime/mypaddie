"use client";

import { useActionState, useState, useTransition } from "react";
import { CATEGORIES, stepFor, type PantryItem } from "../pantry";
import { removeItemAction, saveItemAction, stepItemAction, type PantryFormState } from "../pantry.actions";

const fmt = (q: number) => (Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100));
const field = "rounded-lg border border-line bg-surface-2 px-3 py-2 text-base";

export function PantryItemRow({ item }: { item: PantryItem }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [state, save, saving] = useActionState<PantryFormState, FormData>(async (prev, form) => {
    const next = await saveItemAction(prev, form);
    if (next && "ok" in next) setEditing(false);
    return next;
  }, null);
  const step = stepFor(item.unit);
  const low = item.lowAt !== null && item.quantity <= item.lowAt;
  const tap = (delta: number) =>
    start(async () => {
      const r = await stepItemAction(item.name, delta);
      setError(r && "error" in r ? r.error : null);
    });

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditing((e) => !e)} className="min-w-0 flex-1 truncate text-left" aria-expanded={editing}>
          {item.name}
        </button>
        <button type="button" disabled={pending || item.quantity <= 0} onClick={() => tap(-step)} aria-label={`Use ${step} ${item.unit} of ${item.name}`} className="h-9 w-9 rounded-lg border border-line text-lg disabled:opacity-40">−</button>
        <span className={`w-20 text-center text-sm ${low ? "font-semibold text-gold" : "text-muted"}`}>
          {fmt(item.quantity)} {item.unit}
        </span>
        <button type="button" disabled={pending} onClick={() => tap(step)} aria-label={`Add ${step} ${item.unit} of ${item.name}`} className="h-9 w-9 rounded-lg border border-line text-lg">+</button>
      </div>
      {error && <p className="mt-1 text-sm text-red" role="alert">{error}</p>}
      {editing && (
        <form action={save} className="mt-2 grid grid-cols-2 gap-2">
          <input type="hidden" name="name" value={item.name} />
          <label className="flex flex-col gap-1 text-xs text-muted">Amount ({item.unit})<input name="quantity" type="number" step="any" min={0} defaultValue={item.quantity} className={field} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Low at<input name="low_at" type="number" step="any" min={0} defaultValue={item.lowAt ?? ""} placeholder="—" className={field} /></label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Category
            <select name="category" defaultValue={item.category} className={field}>
              {[...new Set([...CATEGORIES, item.category])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {state && "error" in state && <p className="col-span-2 text-sm text-red" role="alert">{state.error}</p>}
          <button disabled={saving} className="rounded-lg bg-gold px-3 py-2 font-semibold text-on-gold disabled:opacity-60">Save</button>
          <button type="button" onClick={() => start(() => removeItemAction(item.name))} className="rounded-lg border border-red/40 px-3 py-2 text-red">Remove</button>
        </form>
      )}
    </li>
  );
}
