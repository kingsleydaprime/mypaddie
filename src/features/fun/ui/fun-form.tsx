"use client";

import { useActionState } from "react";
import { currencySymbol } from "@/shared/format";
import { FUN_COMPANY, FUN_ENERGY, type FunActivity } from "../fun";
import { addFunAction, editFunAction, type FunFormState } from "../fun.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const COMPANY_LABEL = { solo: "Alone", together: "With people", either: "Either" } as const;

/** Add (no `activity`) or edit one. */
export function FunForm({ activity, currency }: { activity?: FunActivity; currency: string }) {
  const action = activity ? editFunAction.bind(null, activity.id) : addFunAction;
  const [state, formAction, pending] = useActionState<FunFormState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="title" required maxLength={100} defaultValue={activity?.title} placeholder="e.g. Football with the guys" className={field} aria-label="What" />
      <div className="grid grid-cols-2 gap-2">
        <input name="cost" type="number" min={0} step={100} defaultValue={activity?.cost ?? ""} placeholder={`Cost ${currencySymbol(currency)} (0 = free)`} className={field} aria-label="Rough cost" />
        <input name="minutes" type="number" min={5} max={1440} defaultValue={activity?.minutes ?? ""} placeholder="Minutes" className={field} aria-label="Roughly how many minutes" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select name="energy" defaultValue={activity?.energy ?? "medium"} className={field} aria-label="Energy it takes">
          {FUN_ENERGY.map((e) => <option key={e} value={e}>{e} energy</option>)}
        </select>
        <select name="company" defaultValue={activity?.company ?? "either"} className={field} aria-label="Who with">
          {FUN_COMPANY.map((c) => <option key={c} value={c}>{COMPANY_LABEL[c]}</option>)}
        </select>
      </div>
      <input name="notes" maxLength={500} defaultValue={activity?.notes ?? ""} placeholder="Notes (where, who, what to bring)" className={field} aria-label="Notes" />
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-muted" role="status">Saved.</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">
        {pending ? "Saving…" : activity ? "Save" : "Add"}
      </button>
    </form>
  );
}
