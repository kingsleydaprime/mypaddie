"use client";

import { useActionState } from "react";
import { deleteAccountAction, type DeleteState } from "../account.actions";

export function YourData() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, null);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">Your data</h2>
      <a href="/app/export" className="rounded-xl border border-line px-4 py-3 text-center font-semibold">Download everything (JSON)</a>
      <details>
        <summary className="cursor-pointer text-sm text-red">Delete my account</summary>
        <form action={action} className="mt-3 flex flex-col gap-2">
          <p className="text-sm">This deletes your account and everything in it — tasks, XP, money, notes, connected AI apps — straight away. It can&apos;t be undone. Download your data first if you want a copy.</p>
          <input name="confirm" autoComplete="off" placeholder='Type "delete my account"' aria-label="Type delete my account to confirm"
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
          {state?.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
          <button disabled={pending} className="rounded-xl border border-red px-4 py-3 font-semibold text-red disabled:opacity-60">{pending ? "Deleting…" : "Delete my account for good"}</button>
        </form>
      </details>
    </section>
  );
}
