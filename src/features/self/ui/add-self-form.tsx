"use client";

import { useActionState } from "react";
import { SELF_KINDS, SELF_LABEL } from "../self";
import { addSelfNoteAction, type SelfFormState } from "../self.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function AddSelfForm() {
  const [state, action, pending] = useActionState<SelfFormState, FormData>(addSelfNoteAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null && "error" in state}>
      <summary className="cursor-pointer font-bold">+ Add something about you</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <select name="kind" defaultValue="pattern" aria-label="Kind" className={field}>
          {SELF_KINDS.map((k) => <option key={k} value={k}>{SELF_LABEL[k]}</option>)}
        </select>
        <input name="title" required maxLength={200} placeholder="In a few words, e.g. I overcommit before exams" aria-label="In a few words" className={field} />
        <textarea name="detail" rows={2} maxLength={2000} placeholder="More, if you want" aria-label="Detail" className={field} />
        <input name="workingOn" maxLength={1000} placeholder="How you're working on it (optional)" aria-label="How you're working on it" className={field} />
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      </form>
    </details>
  );
}
