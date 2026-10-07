"use client";

import { useActionState, useState } from "react";
import { signUpAction, type SignUpState } from "./actions";

const field = "rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted";

export function SignUpForm({ invite, inviteRequired }: { invite: string; inviteRequired: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpAction, null);
  const [withPassword, setWithPassword] = useState(false);

  if (state && "checkEmail" in state) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4" role="status">
        <p className="font-semibold">Check your email</p>
        <p className="text-sm text-muted">
          We sent a link to {state.checkEmail}. {state.why === "link" ? "Tap it to finish signing up" : "Tap it to confirm your email"} — it works on any device. Not there? Check spam.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      {(inviteRequired || invite) && <input name="invite" required={inviteRequired} defaultValue={invite} autoCapitalize="characters" autoComplete="off" spellCheck={false}
        placeholder="Invite code" aria-label="Invite code" className={`${field} font-mono tracking-widest uppercase`} />}
      <input name="email" type="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" className={field} />
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button name="method" value="google" disabled={pending} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 font-semibold disabled:opacity-60">
        <span aria-hidden className="font-bold">G</span> Continue with Google
      </button>
      <button name="method" value="link" disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">
        {pending ? "Checking…" : "Email me a sign-up link"}
      </button>
      {withPassword ? (
        <div className="flex flex-col gap-3">
          <input name="password" type="password" autoComplete="new-password" minLength={10} placeholder="Password (10+ characters)" aria-label="Password" className={field} />
          <button name="method" value="password" disabled={pending} className="rounded-xl border border-gold px-4 py-3.5 font-semibold text-gold disabled:opacity-60">Create account with password</button>
        </div>
      ) : (
        <button type="button" onClick={() => setWithPassword(true)} className="text-sm text-muted underline">I&apos;d rather use a password</button>
      )}
      {inviteRequired && <p className="text-xs text-muted">With Google, pick the account for the email above — that&apos;s the one your invite is for.</p>}
    </form>
  );
}
