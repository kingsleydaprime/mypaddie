"use client";

import { useActionState, useState } from "react";
import type { Invite } from "../invites.repo";
import { createInviteAction, revokeInviteAction, type InviteFormState } from "../invites.actions";
import { SubmitButton } from "@/shared/ui/submit-button";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const STATUS: Record<Invite["status"], string> = { waiting: "waiting", used: "joined", expired: "expired", revoked: "revoked" };

function linkFor(code: string) {
  return `${typeof window === "undefined" ? "" : window.location.origin}/login?invite=${code}`;
}

function Share({ code, email }: { code: string; email: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `Join me on MyPaddie: ${linkFor(code)} (invite code ${code})`;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gold p-3" role="status">
      <p className="text-sm">Invite code <span className="font-mono text-lg font-bold tracking-widest">{code}</span>{email ? ` — for ${email}` : ""}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ text });
              else {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              }
            } catch {
              // Share sheet dismissed: nothing to do.
            }
          }}
          className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold"
        >
          Share invite
        </button>
        {copied && <span className="self-center text-sm text-muted">Copied</span>}
      </div>
    </div>
  );
}

export function InvitePanel({ invites, left }: { invites: Invite[]; left: number }) {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInviteAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null}>
      <summary className="cursor-pointer font-bold">Invite someone <span className="text-sm font-normal text-muted">· {left} left</span></summary>
      <div className="mt-3 flex flex-col gap-3">
        {state && "code" in state && <Share code={state.code} email={state.email} />}
        {left > 0 ? (
          <form action={action} className="flex flex-col gap-2">
            <input name="email" type="email" placeholder="Their email (optional — lets them use Google)" className={field} aria-label="Their email" />
            <input name="note" maxLength={200} placeholder="Note to yourself (optional)" className={field} aria-label="Note" />
            {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
            <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Making…" : "Make an invite"}</button>
            <p className="text-xs text-muted">With their email, they can sign up with Google, an email link or a password. Without it, anyone with the code can use it once. Invites last 30 days.</p>
          </form>
        ) : (
          <p className="text-sm text-muted">No invites left right now.</p>
        )}
        {invites.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono">{i.code}</span>
                  <span className="text-muted"> · {i.email ?? i.note ?? "open"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={i.status === "used" ? "text-green" : "text-muted"}>{STATUS[i.status]}</span>
                  {i.status === "waiting" && (
                    <form action={revokeInviteAction.bind(null, i.id)}>
                      <SubmitButton className="text-xs text-muted underline">revoke</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
