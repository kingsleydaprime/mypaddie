import Link from "next/link";
import { METRIC_INFO, METRICS, type Metric } from "@/features/metrics/metrics";
import { finishExperimentAction, startExperimentAction } from "@/features/metrics/metrics.actions";
import { loadCheckin, loadExperiments, loadTrends } from "@/features/metrics/metrics.repo";
import { CheckinForm } from "@/features/metrics/ui/checkin-form";
import { Sparkline } from "@/features/metrics/ui/sparkline";
import { currentConfig } from "@/shared/config";
import { formatMoney } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";
import { dayKey } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";

const show = (metric: Metric, v: number | null) => {
  if (v === null) return "—";
  if (metric === "spending") return formatMoney(Math.round(v));
  if (metric === "word_kept") return `${Math.round(v)}%`;
  return `${Math.round(v * 10) / 10}`;
};

const ARROW = { up: "↑", down: "↓", steady: "→", not_enough: "" } as const;
const VERDICT = { helped: "Helped", no_difference: "No difference", made_worse: "Made it worse", unclear: "Unclear" } as const;

export default async function TrendsPage() {
  const db = await requireDb("/app/stats/trends");
  const now = new Date();
  const [trends, experiments, today] = await Promise.all([loadTrends(db, now, 8), loadExperiments(db, now), loadCheckin(db, dayKey(now, currentConfig().timeZone))]);
  const running = experiments.filter((e) => e.status === "running");
  const finished = experiments.filter((e) => e.status !== "running");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link href="/app/stats" className="text-muted" aria-label="Back to stats">‹ Stats</Link>
        <h1 className="text-2xl font-bold">Trends</h1>
      </header>

      <details className="rounded-2xl border border-line bg-surface p-4" open={!today}>
        <summary className="cursor-pointer font-semibold">{today ? "Today's check-in ✓" : "Check in for today"}</summary>
        <div className="mt-3"><CheckinForm current={today} /></div>
      </details>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Last 8 weeks</h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {trends.map((t) => {
            const latest = [...t.series].reverse().find((s) => s.value !== null)?.value ?? null;
            return (
              <li key={t.metric} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-sm text-muted">
                    {latest === null ? "Nothing logged yet" : <>{show(t.metric, latest)} {t.metric === "word_kept" || t.metric === "spending" ? "" : t.unit}</>}
                    {t.trend.direction !== "not_enough" && (
                      <span className={t.trend.good ? " text-gold" : ""}> {ARROW[t.trend.direction]} {t.trend.direction === "steady" ? "steady" : `from ${show(t.metric, t.trend.before)}`}</span>
                    )}
                  </p>
                </div>
                <Sparkline values={t.series.map((s) => s.value)} good={t.trend.good} />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">Weekly, Monday to Sunday. The arrow compares the last 2 weeks with the 4 before; gold means it&apos;s going the better way.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Experiments</h2>
        <p className="-mt-1 text-sm text-muted">Change one thing for a while and see what it does. &ldquo;No phone after 10pm for 2 weeks — do I sleep better?&rdquo;</p>
        {running.map((e) => (
          <div key={e.id} className={`rounded-2xl border bg-surface px-4 py-3 text-sm ${e.due ? "border-gold" : "border-line"}`}>
            <p className="font-medium">{e.change}</p>
            {e.question && <p className="text-muted">{e.question}</p>}
            <p className="mt-1 text-xs text-muted">{e.starts_on} → {e.ends_on}{e.due ? " · ended — how did it go?" : ` · ${e.daysLeft} days left`}</p>
            {e.comparison && e.metric && (
              <p className="mt-1">
                {METRIC_INFO[e.metric as Metric].label}: {show(e.metric as Metric, e.comparison.before)} before → {show(e.metric as Metric, e.comparison.during)} during
                {!e.comparison.enoughData && <span className="text-muted"> (not enough days logged to say yet)</span>}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {(["helped", "no_difference", "made_worse", "unclear"] as const).map((c) => (
                <form key={c} action={finishExperimentAction.bind(null, e.id, c)}>
                  <SubmitButton className="rounded-full border border-line px-2.5 py-0.5 text-xs">{VERDICT[c]}</SubmitButton>
                </form>
              ))}
              <form action={finishExperimentAction.bind(null, e.id, "abandon")}><SubmitButton className="px-1 py-0.5 text-xs text-muted">Stop</SubmitButton></form>
            </div>
          </div>
        ))}
        <form action={startExperimentAction} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          <input name="change" required maxLength={200} placeholder="What you'll change" aria-label="What you'll change" className="rounded-lg border border-line bg-surface-2 px-3 py-2" />
          <input name="question" maxLength={300} placeholder="What you want to find out (optional)" aria-label="Question" className="rounded-lg border border-line bg-surface-2 px-3 py-2" />
          <div className="flex flex-wrap gap-2">
            <select name="metric" aria-label="What to watch" defaultValue="" className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <option value="">Judge by feel</option>
              {METRICS.map((m) => <option key={m} value={m}>Watch {METRIC_INFO[m].label.toLowerCase()}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              for <input name="days" type="number" min={3} max={90} defaultValue={14} aria-label="Days" className="w-16 rounded-lg border border-line bg-surface-2 px-2 py-2" /> days
            </label>
          </div>
          <SubmitButton className="self-start rounded-xl border border-gold px-3 py-2 text-sm font-semibold text-gold">Start experiment</SubmitButton>
        </form>
        {finished.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {finished.map((e) => (
              <li key={e.id} className="text-muted">
                <span className="text-text">{e.change}</span> — {e.status === "abandoned" ? "stopped" : VERDICT[e.conclusion as keyof typeof VERDICT] ?? "done"}
                {e.result ? `: ${e.result}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
