import Link from "next/link";
import { valuesText } from "@/features/values/values";
import { setValuesAction } from "@/features/values/values.actions";
import { loadValues } from "@/features/values/values.repo";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ValuesPage() {
  const db = await requireDb("/app/me/values");
  const values = await loadValues(db);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">Values</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">
        What you stand on, most important first. Paddie weighs big choices — a job, a purchase, a new commitment — against these,
        and says so when one pulls against them. It won&apos;t preach.
      </p>
      {values.length > 0 && (
        <ol className="flex flex-col gap-2">
          {values.map((v, i) => (
            <li key={v.id} className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <span className="font-bold text-gold">{i + 1}</span>
              <div>
                <p className="font-semibold">{v.value}</p>
                {v.why && <p className="text-sm text-muted">{v.why}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <form action={setValuesAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{values.length ? "Edit your values" : "Name your values"}</span>
          <span className="text-xs text-muted">One per line, most important first. Add why after a dash: &ldquo;Honesty — I want to be trusted&rdquo;.</span>
          <textarea name="values" rows={6} maxLength={8000} defaultValue={valuesText(values)} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
        </label>
        <SubmitButton className="self-start rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-on-gold">Save values</SubmitButton>
      </form>
      <p className="text-xs text-muted">Not sure yet? Ask Paddie to help you find them — it&apos;ll ask, not tell.</p>
    </div>
  );
}
