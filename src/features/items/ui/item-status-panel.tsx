"use client";

import { useActionState } from "react";
import { PILLARS } from "@/shared/domain";
import { SubmitButton } from "@/shared/ui/submit-button";
import { itemStatusAction, type ItemActionState } from "../items.actions";
import type { ItemStatus } from "../items";

const button = "rounded-xl border border-line px-4 py-3 text-sm font-semibold";
const label = (p: string) => p[0].toUpperCase() + p.slice(1);

/** Finish, pause, drop, reopen or delete a quest. Which buttons show depends on where it is now. */
export function ItemStatusPanel({ id, status, pays }: { id: string; status: ItemStatus; pays: boolean }) {
  const [state, action] = useActionState<ItemActionState, FormData>(itemStatusAction, null);
  const open = status === "active" || status === "paused";

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {state?.askPillar && (
        <label className="flex flex-col gap-1 text-sm text-muted">
          {state.message}
          <select name="pillar" required className="rounded-xl border border-line bg-surface px-4 py-3.5 text-base text-current">
            {PILLARS.map((p) => (
              <option key={p} value={p}>{label(p)}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        {open && (
          <SubmitButton name="to" value="done" className="col-span-2 rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold">
            {pays ? "Done — claim the bonus" : "Mark done"}
          </SubmitButton>
        )}
        {status === "active" && <SubmitButton name="to" value="paused" className={button}>Pause</SubmitButton>}
        {status !== "active" && <SubmitButton name="to" value="active" className={button}>{status === "paused" ? "Resume" : "Reopen"}</SubmitButton>}
        {open && <SubmitButton name="to" value="dropped" className={button}>Drop it</SubmitButton>}
        <SubmitButton name="to" value="delete" className={`${button} text-red`}>Delete</SubmitButton>
      </div>
      {state?.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
      {state?.message && !state.askPillar && <p className="text-sm text-muted" role="status">{state.message}</p>}
    </form>
  );
}
