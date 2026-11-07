import Link from "next/link";
import { loadQuits } from "@/features/quits/quits.repo";
import { shownName } from "@/features/quits/ui/labels";
import { QuitCounter } from "@/features/quits/ui/quit-counter";
import { StartQuitForm } from "@/features/quits/ui/start-quit-form";
import { requireDb } from "@/shared/supabase/session";

export default async function QuitsPage() {
  const db = await requireDb("/app/quits");
  const quits = (await loadQuits(db, new Date())).map((q) => q.quit);
  const active = quits.filter((q) => q.status === "active");
  const stopped = quits.filter((q) => q.status !== "active");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/more" className="text-muted" aria-label="Back to others">‹ Others</Link>
        <h1 className="text-2xl font-bold">Quitting</h1>
      </header>

      {quits.length === 0 && (
        <p className="text-sm text-muted">
          Something you&apos;re stopping or cutting down: a day counter, milestones, and no shame when you slip.
          Give it a private name and that&apos;s all anyone (Paddie included) sees.
        </p>
      )}
      <StartQuitForm open={quits.length === 0} />

      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((q) => (
            <li key={q.id}>
              <Link href={`/app/quits/${q.id}`} className="block rounded-2xl border border-line bg-surface p-4">
                <p className="mb-2 font-semibold">{shownName(q)}</p>
                <QuitCounter quit={q} size="md" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {stopped.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-muted">Stopped</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {stopped.map((q) => (
              <li key={q.id}>
                <Link href={`/app/quits/${q.id}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="truncate text-sm">{shownName(q)}</span>
                  <span className="shrink-0 text-xs text-muted">{q.status} · best {q.progress.longestDays}d</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
