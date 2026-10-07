"use client";

import { useActionState } from "react";
import { COMMITMENT_KINDS, COMMITMENT_PRIORITIES, KIND_LABEL } from "../commitments";
import { addCommitmentAction, type CommitmentFormState } from "../commitments.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const DAYS = [["MO", "M"], ["TU", "T"], ["WE", "W"], ["TH", "T"], ["FR", "F"], ["SA", "S"], ["SU", "S"]] as const;

export function AddCommitmentForm() {
  const [state, action, pending] = useActionState<CommitmentFormState, FormData>(addCommitmentAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null && "error" in state}>
      <summary className="cursor-pointer font-bold">+ Add a job, role, group or team</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" defaultValue="membership" className={field} aria-label="Kind">
            {COMMITMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select name="priority" defaultValue="important" className={field} aria-label="Priority">
            {COMMITMENT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <input name="title" required maxLength={120} placeholder="Your role: Striker, Ambassador, Member" className={field} aria-label="Your role" />
        <input name="org" maxLength={120} placeholder="Where: school team, Igbo Students Union, church choir" className={field} aria-label="Organisation" />
        <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm text-muted">Regular session (optional)</legend>
          <input name="sessionTitle" maxLength={200} placeholder="e.g. Team training, Rehearsal, Shift" className={field} aria-label="Session name" />
          <div className="flex justify-between gap-1" role="group" aria-label="Days">
            {DAYS.map(([code, letter]) => (
              <label key={code} className="flex flex-1 cursor-pointer flex-col items-center rounded-lg border border-line py-1.5 text-sm has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-on-gold">
                <input type="checkbox" name={`day-${code}`} className="sr-only" aria-label={code} />
                {letter}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input name="sessionTime" type="time" className={field} aria-label="Start time" />
            <input name="sessionMinutes" type="number" min={5} max={720} placeholder="Minutes" className={field} aria-label="Length in minutes" />
          </div>
        </fieldset>
        <input name="extraHours" type="number" min={0} max={100} step={0.5} placeholder="Unscheduled hours a week (freelance work, admin)" className={field} aria-label="Unscheduled hours a week" />
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        {state && "ok" in state && state.message && <p className="text-sm text-muted" role="status">{state.message}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Add"}</button>
      </form>
    </details>
  );
}
