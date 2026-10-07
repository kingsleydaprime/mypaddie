"use client";

import { useActionState } from "react";
import { setNewPassword, type ResetState } from "./actions";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<ResetState, FormData>(setNewPassword, null);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="New password (10+ characters)" aria-label="New password"
          className="rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted" />
        {state?.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save and continue"}</button>
      </form>
    </main>
  );
}
