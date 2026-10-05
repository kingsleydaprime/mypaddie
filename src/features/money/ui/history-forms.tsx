"use client";

import { useActionState } from "react";
import { editTransactionAction, setBalanceAction, voidTransactionAction, type FormState } from "../money.history.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const Msg = ({ s }: { s: FormState }) =>
  s ? <p className={`text-sm ${"error" in s ? "text-red" : "text-green"}`} role={"error" in s ? "alert" : "status"}>{"error" in s ? s.error : s.ok}</p> : null;

export function SetBalanceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setBalanceAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Balance not right? Set it</summary>
      <p className="mt-2 text-sm text-muted">What&apos;s actually in your account(s) now. The first time, it&apos;s your opening balance; after that, a correction for the difference. Neither counts as income or spending.</p>
      <form action={action} className="mt-3 flex gap-2">
        <input name="amount" inputMode="numeric" required placeholder="₦ amount" className={`${field} flex-1`} />
        <button disabled={pending} className="rounded-xl bg-gold px-4 font-semibold text-on-gold disabled:opacity-60">Set</button>
      </form>
      <div className="mt-2"><Msg s={state} /></div>
    </details>
  );
}

export function EditTransactionForm({ id, note, category }: { id: string; note: string; category: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(editTransactionAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm text-muted">Narration<input name="note" defaultValue={note} maxLength={500} placeholder="e.g. Lunch with Tolu at Mama Put" className={field} /></label>
      <label className="flex flex-col gap-1 text-sm text-muted">Category<input name="category" defaultValue={category} required className={field} /></label>
      <Msg s={state} />
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">Save</button>
    </form>
  );
}

export function VoidTransactionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(voidTransactionAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted">Logged by mistake? Voiding keeps it on the record but stops it counting. Its bucket money goes back and the logging XP is taken back. To fix the amount or need/want, void it and log it again.</p>
      <input name="reason" maxLength={200} placeholder="Why? (optional)" className={field} />
      <Msg s={state} />
      <button disabled={pending} className="rounded-xl border border-red/40 px-4 py-3 text-red disabled:opacity-60">Void this entry</button>
    </form>
  );
}
