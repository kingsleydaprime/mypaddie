"use client";

import { useActionState, useState } from "react";
import { currencySymbol } from "@/shared/format";
import { TIERS, type Tier } from "@/shared/domain";
import { addItemAction, updateItemAction, type AddItemState } from "../items.actions";
import { TIER_INFO } from "../tiers";

const field = "rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted";

export interface EditableItem {
  id: string;
  tier: Tier;
  title: string;
  target: string | null;
  deadline: string | null;
  floorAmount: number | null;
  comfortableAmount: number | null;
}

/** Adds a quest, or edits one when `item` is given (same fields; the tier can change too). */
export function AddItemForm({ initialTier, currency, item }: { initialTier: Tier; currency: string; item?: EditableItem }) {
  const [tier, setTier] = useState<Tier>(item?.tier ?? initialTier);
  const [state, action, pending] = useActionState<AddItemState, FormData>(item ? updateItemAction : addItemAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">What kind?</legend>
        {TIERS.map((t) => (
          <label key={t} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium ${tier === t ? "border-gold bg-gold text-on-gold" : "border-line text-muted"}`}>
            <input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} className="sr-only" />
            {TIER_INFO[t].label}
          </label>
        ))}
      </fieldset>
      <p className="-mt-2 text-sm text-muted">{TIER_INFO[tier].blurb}</p>

      <input name="title" required placeholder="Name it" defaultValue={item?.title} className={field} autoFocus={!item} />

      {(tier === "goal" || tier === "dream") && (
        <>
          <input name="target" placeholder={tier === "goal" ? "What does done look like?" : "What would it look like?"} defaultValue={item?.target ?? ""} className={field} />
          <label className="flex flex-col gap-1 text-sm text-muted">
            Deadline{tier === "dream" ? " (optional)" : ""}
            <input name="deadline" type="date" defaultValue={item?.deadline?.slice(0, 10) ?? ""} className={field} />
          </label>
        </>
      )}

      {tier === "need" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Cheapest honest {currencySymbol(currency)}/mo
            <input name="floor_amount" inputMode="numeric" placeholder="optional" defaultValue={item?.floorAmount ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            What you spend now {currencySymbol(currency)}/mo
            <input name="comfortable_amount" inputMode="numeric" placeholder="optional" defaultValue={item?.comfortableAmount ?? ""} className={field} />
          </label>
        </div>
      )}

      {state?.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 text-base font-semibold text-on-gold disabled:opacity-60">
        {item ? (pending ? "Saving…" : "Save") : pending ? "Adding…" : `Add ${TIER_INFO[tier].label.toLowerCase()}`}
      </button>
    </form>
  );
}
