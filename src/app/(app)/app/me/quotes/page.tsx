import Link from "next/link";
import { addQuoteAction, deleteQuoteAction } from "@/features/quotes/quotes.actions";
import { loadQuotes } from "@/features/quotes/quotes.repo";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function QuotesPage() {
  const db = await requireDb("/app/me/quotes");
  const quotes = await loadQuotes(db);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">Quotes</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">
        Lines that keep you going. One shows on Home each day — yours most days, a built-in one now and then. You can also tell Paddie to save one.
      </p>
      <form action={addQuoteAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Add a quote</span>
          <span className="text-xs text-muted">Who said it goes after a dash: &ldquo;Keep going. — Mum&rdquo;.</span>
          <textarea name="quote" rows={2} maxLength={640} required className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
        </label>
        <SubmitButton className="self-start rounded-lg bg-gold px-3.5 py-1.5 text-sm font-semibold text-on-gold">Save quote</SubmitButton>
      </form>
      {quotes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <figure className="min-w-0">
                <blockquote className="text-pretty">&ldquo;{q.text}&rdquo;</blockquote>
                {q.author && <figcaption className="mt-0.5 text-sm text-muted">— {q.author}</figcaption>}
              </figure>
              <form action={deleteQuoteAction.bind(null, q.id)}>
                <SubmitButton aria-label="Delete this quote" className="rounded-lg px-2 py-1 text-sm text-muted hover:text-red">✕</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
