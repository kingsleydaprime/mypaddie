import Link from "next/link";
import { loadDecisions } from "@/features/decisions/decisions.repo";
import { periodOf } from "@/features/reviews/periods";
import { logDecisionAction, reviewDecisionAction } from "@/features/reviews/reviews.actions";
import { currentThemes, loadReviews, owedReviews } from "@/features/reviews/reviews.repo";
import { loadSchedule } from "@/features/settings/settings.repo";
import { ThemeForm } from "@/features/reviews/ui/theme-form";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { dayKey } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function GrowthPage({ searchParams }: PageProps<"/app/growth">) {
  const { saved } = await searchParams;
  const db = await requireDb("/app/growth");
  const now = new Date();
  const today = dayKey(now, currentConfig().timeZone);
  const [themes, owed, reviews, decisions, schedule] = await Promise.all([currentThemes(db, now), owedReviews(db, now), loadReviews(db, 12), loadDecisions(db, now), loadSchedule(db)]);
  const month = periodOf("month", today);
  const year = periodOf("year", today);
  const week = periodOf("week", today, schedule.weekStart);
  const weekEndDay = schedule.weekStart === "sunday" ? "Saturday" : "Sunday";
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">Growth</h1>
      </header>
      {saved === "1" && <p className="rounded-2xl border border-line bg-surface p-3 text-sm" role="status">Review saved. Well done for looking back.</p>}

      {owed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-gold bg-surface p-4">
          <p className="font-semibold">Time to look back</p>
          {owed.map((o) => (
            <Link key={o.period} href={`/app/growth/review?period=${o.period}&day=${o.start}`} className="rounded-xl bg-gold px-4 py-2.5 text-center font-semibold text-on-gold">Review {o.label}</Link>
          ))}
          <p className="text-xs text-muted">Or ask Paddie: &ldquo;let&apos;s do my review&rdquo; — it brings the facts.</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">Themes</h2>
        {[{ p: "month" as const, label: month.label, day: today, t: themes.month }, { p: "year" as const, label: year.label, day: today, t: themes.year }].map(({ p, label, day, t }) => (
          <details key={p} className="rounded-2xl border border-line bg-surface p-4" open={!t}>
            <summary className="cursor-pointer">
              <span className="text-xs tracking-widest text-muted uppercase">{label}</span>
              <span className="block font-semibold">{t ? t.title : `No theme for ${p === "month" ? "this month" : "this year"} yet`}</span>
              {t && t.focus.length > 0 && <span className="block text-sm text-muted">Focus: {t.focus.join(" · ")}</span>}
              {t && t.notNow.length > 0 && <span className="block text-sm text-muted">Not now: {t.notNow.join(" · ")}</span>}
            </summary>
            <div className="mt-3"><ThemeForm period={p} day={day} label={label} current={t ? { title: t.title, focus: t.focus, notNow: t.notNow } : undefined} /></div>
          </details>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">Reviews</h2>
          <Link href={`/app/growth/review?period=week&day=${week.start}`} className="text-sm text-gold">Review this week ›</Link>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">None yet. Every {weekEndDay} evening Paddie will offer one; at the end of each month, quarter and year too.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {reviews.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <details>
                  <summary className="cursor-pointer font-medium">{r.label} <span className="text-xs text-muted">· {r.period}</span></summary>
                  {r.summary && <p className="mt-2 text-sm whitespace-pre-line">{r.summary}</p>}
                  {r.answers.change && <p className="mt-2 text-sm"><span className="text-muted">To change:</span> {r.answers.change}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Decisions</h2>
        <form action={logDecisionAction} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          <input name="decision" required maxLength={300} placeholder="A decision worth checking later" aria-label="Decision" className="rounded-lg border border-line bg-surface-2 px-3 py-2" />
          <input name="why" maxLength={2000} placeholder="Why" aria-label="Why" className="rounded-lg border border-line bg-surface-2 px-3 py-2" />
          <input name="expected" maxLength={1000} placeholder="What you expect to happen" aria-label="Expected" className="rounded-lg border border-line bg-surface-2 px-3 py-2" />
          <SubmitButton className="self-start rounded-xl border border-gold px-3 py-2 text-sm font-semibold text-gold">Log it — review in 30 days</SubmitButton>
        </form>
        {decisions.map((d) => (
          <div key={d.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
            <p className="font-medium">{d.decision}</p>
            {d.why && <p className="text-muted">Why: {d.why}</p>}
            {d.verdict ? (
              <p className="mt-1">{d.verdict === "worked" ? "✓ Worked" : d.verdict === "partly" ? "≈ Partly" : "✗ Didn't work"}{d.outcome ? ` — ${d.outcome}` : ""}</p>
            ) : d.dueForReview ? (
              <div className="mt-2 flex gap-2">
                <span className="text-gold">How did it go?</span>
                {(["worked", "partly", "didnt"] as const).map((v) => (
                  <form key={v} action={reviewDecisionAction.bind(null, d.id, v)}>
                    <SubmitButton className="rounded-full border border-line px-2.5 py-0.5 text-xs">{v === "didnt" ? "Didn't" : v[0]!.toUpperCase() + v.slice(1)}</SubmitButton>
                  </form>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">Look back {d.review_on ?? "any time"}</p>
            )}
          </div>
        ))}
      </section>

      <Link href="/app/achievements" className="rounded-2xl border border-line bg-surface p-4 font-semibold">Achievements <span className="text-gold">›</span></Link>
    </div>
  );
}
