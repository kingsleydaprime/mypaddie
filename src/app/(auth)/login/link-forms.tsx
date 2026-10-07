"use client";

import { useActionState } from "react";
import { sendPasswordReset, sendSignInLink, type LinkState } from "./actions";

const field = "rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted";

function Sent({ email, what }: { email: string; what: string }) {
  return <p className="text-sm text-muted" role="status">If {email} has an account, {what} is on its way. It works on any device; check spam if it&apos;s not there.</p>;
}

export function SignInLinkForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(sendSignInLink, null);
  if (state && "sent" in state) return <Sent email={state.sent} what="a sign-in link" />;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} />
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">{pending ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(sendPasswordReset, null);
  if (state && "sent" in state) return <Sent email={state.sent} what="a reset link" />;
  return (
    <form action={action} className="flex gap-2">
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email for the reset link" className={`${field} flex-1`} />
      <button disabled={pending} className="rounded-xl border border-line px-4 font-semibold disabled:opacity-60">Send</button>
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
    </form>
  );
}
