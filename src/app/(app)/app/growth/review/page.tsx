import Link from "next/link";
import { REVIEW_PERIODS, type ReviewPeriod } from "@/features/reviews/periods";
import { saveReviewAction } from "@/features/reviews/reviews.actions";
import { reviewDigest } from "@/features/reviews/reviews.repo";
import { currentConfig } from "@/shared/config";
import { formatMoney } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";
import { dayKey } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function ReviewPage({ searchParams }: PageProps<"/app/growth/review">) {
  const sp = await searchParams;
  const period = (REVIEW_PERIODS.includes(sp.period as ReviewPeriod) ? sp.period : "week") as ReviewPeriod;
  const db = await requireDb("/app/growth");
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : dayKey(new Date(), currentConfig().timeZone);
  const d = await reviewDigest(db, period, day);
  const facts = [
    `${d.done.count} things done${d.done.most.length ? ` — most often ${d.done.most.slice(0, 3).map((m) => m.name).join(", ")}` : ""}`,
    d.workouts ? `${d.workouts} workouts` : null,
    d.study.length ? `Study: ${d.study.map((s) => `${s.skill} ${Math.round(s.minutes / 6) / 10}h`).join(", ")}` : null,
    d.peopleTalkedTo.length ? `Talked to ${d.peopleTalkedTo.join(", ")}` : null,
    d.promises.kept || d.promises.broken.length ? `Promises: ${d.promises.kept} kept${d.promises.broken.length ? `, broken: ${d.promises.broken.join("; ")}` : ""}` : null,
    d.slips.length ? `Slips: ${d.slips.map((s) => `${s.task} (${s.why})`).join("; ")}` : null,
    d.money.in || d.money.out ? `Money: in ${formatMoney(d.money.in)}, out ${formatMoney(d.money.out)}${d.money.wants ? ` (${formatMoney(d.money.wants)} on wants)` : ""}` : null,
    d.bucketListDone.length ? `Bucket list: ${d.bucketListDone.join(", ")} 🎉` : null,
    d.energy ? `Energy averaged ${d.energy.average}/5` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/growth" className="text-muted" aria-label="Back to growth">‹ Growth</Link>
        <h1 className="text-2xl font-bold">{d.label}</h1>
      </header>
      {Object.values(d.theme).length > 0 && <p className="text-sm text-muted">Theme: {Object.values(d.theme).map((t) => t.title).join(" · ")}</p>}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">What happened</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">{facts.map((f) => <li key={f}>• {f}</li>)}</ul>
        {d.lastTimeSaidToChange && <p className="mt-3 text-sm"><span className="text-muted">Last time you said you&apos;d change:</span> {d.lastTimeSaidToChange}</p>}
      </section>
      <form action={saveReviewAction.bind(null, period, d.from)} className="flex flex-col gap-3">
        {d.questions.map((q) => (
          <label key={q.key} className="flex flex-col gap-1">
            <span className="font-medium">{q.q}</span>
            <textarea name={q.key} rows={2} maxLength={2000} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
          </label>
        ))}
        <SubmitButton className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Save review</SubmitButton>
      </form>
      <p className="text-xs text-muted">Prefer talking it through? Ask Paddie &ldquo;let&apos;s do my {period} review&rdquo; — it writes the report with you.</p>
    </div>
  );
}
