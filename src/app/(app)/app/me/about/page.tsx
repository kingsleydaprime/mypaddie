import Link from "next/link";
import { SELF_KINDS, SELF_LABEL } from "@/features/self/self";
import { removeSelfNoteAction, resolveSelfNoteAction } from "@/features/self/self.actions";
import { loadSelf } from "@/features/self/self.repo";
import { AddSelfForm } from "@/features/self/ui/add-self-form";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function AboutMePage() {
  const db = await requireDb("/app/me/about");
  const notes = await loadSelf(db, { includeResolved: true });
  const active = notes.filter((n) => n.status === "active");
  const resolved = notes.filter((n) => n.status === "resolved");
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">About me</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">The good, the bad and the in-progress. Only you and the AI apps you connect can see this; Paddie uses it to give advice that fits you.</p>
      <AddSelfForm />
      {SELF_KINDS.map((k) => {
        const list = active.filter((n) => n.kind === k);
        if (!list.length) return null;
        return (
          <section key={k} className="flex flex-col gap-2">
            <h2 className="font-bold">{SELF_LABEL[k]}</h2>
            <ul className="flex flex-col gap-2">
              {list.map((n) => (
                <li key={n.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                  <p className="font-medium">{n.title}</p>
                  {n.detail && <p className="mt-1 text-sm text-muted">{n.detail}</p>}
                  {n.working_on && <p className="mt-1 text-sm">Working on it: {n.working_on}</p>}
                  <div className="mt-2 flex gap-3 text-xs">
                    {k !== "strength" && k !== "good_habit" && k !== "history" && (
                      <form action={resolveSelfNoteAction.bind(null, n.id)}><SubmitButton className="font-semibold text-gold">Resolved 🎉</SubmitButton></form>
                    )}
                    <form action={removeSelfNoteAction.bind(null, n.id)}><SubmitButton className="text-muted">Remove</SubmitButton></form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {active.length === 0 && <p className="text-sm text-muted">Nothing yet. Add what you know — or tell Paddie when you notice a pattern, and it&apos;ll offer to keep it.</p>}
      {resolved.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-bold text-muted">Left behind</h2>
          {resolved.map((n) => <p key={n.id} className="text-sm text-muted line-through">{n.title}</p>)}
        </section>
      )}
    </div>
  );
}
