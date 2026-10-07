"use client";

import { useActionState } from "react";
import { sendFeedbackAction, type FeedbackState } from "../feedback.actions";

export function FeedbackForm() {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedbackAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Send feedback</summary>
      {state && "ok" in state ? (
        <p className="mt-3 text-sm" role="status">Thank you — it&apos;s with the team.</p>
      ) : (
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="page" value="settings" />
          <textarea name="message" rows={4} maxLength={4000} required placeholder="What's working, what's annoying, what's missing?"
            aria-label="Feedback" className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
          {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
          <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Sending…" : "Send"}</button>
        </form>
      )}
    </details>
  );
}
