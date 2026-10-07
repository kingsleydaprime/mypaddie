import Link from "next/link";
import { keepPromiseAction, releasePromiseAction, renegotiateAction } from "@/features/promises/promises.actions";
import { applyBrokenPromises, loadPromisePicture } from "@/features/promises/promises.repo";
import { AddPromiseForm } from "@/features/promises/ui/add-promise-form";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { formatLocal } from "@/shared/time";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const when = (days: number | null) => (days === null ? "no deadline" : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`);
const STATUS = { kept: "kept", released: "released", broken: "broken", open: "open" } as const;

export default async function PromisesPage() {
  const db = await requireDb("/app/promises");
  const now = new Date();
  await applyBrokenPromises(db, now);
  const { open, recent, patterns } = await loadPromisePicture(db, now);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Promises</h1>
      </header>
      <AddPromiseForm />

      {patterns.length > 0 && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm">
          {patterns.map((p) => `${p.broken} broken to ${p.person}`).join(" · ")} in the last 90 days. Worth a look.
        </p>
      )}

      {open.length === 0 && <p className="text-sm text-muted">No open promises. Tell Paddie when you make one, or add it above.</p>}
      {open.length > 0 && (
        <ul className="flex flex-col gap-2">
          {open.map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="font-semibold">{p.what}</p>
              <p className={`text-sm ${p.daysLeft !== null && p.daysLeft <= 1 ? "text-gold" : "text-muted"}`}>
                to {p.person} · {when(p.daysLeft)}{p.dueAt ? ` (${formatLocal(p.dueAt, tz())})` : ""}{p.renegotiations ? ` · moved ${p.renegotiations}×` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={keepPromiseAction.bind(null, p.id)}>
                  <button className="rounded-xl bg-gold px-3 py-1.5 text-sm font-semibold text-on-gold">Kept it</button>
                </form>
                <form action={releasePromiseAction.bind(null, p.id)}>
                  <button className="rounded-xl border border-line px-3 py-1.5 text-sm text-muted">They let me off</button>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted">Told them a new date?</summary>
                <form action={renegotiateAction.bind(null, p.id)} className="mt-2 flex gap-2">
                  <input name="date" type="date" required className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5" aria-label="New date" />
                  <input name="time" type="time" className="rounded-lg border border-line bg-surface-2 px-2 py-1.5" aria-label="New time (optional)" />
                  <button className="text-sm font-semibold text-gold">Move</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-muted">Recent</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {recent.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm">{p.what} <span className="text-muted">· {p.person}</span></span>
                <span className={`shrink-0 text-xs ${p.status === "kept" ? "text-green" : p.status === "broken" ? "text-red" : "text-muted"}`}>
                  {STATUS[p.status]}{p.status === "broken" && p.keptAt ? ", kept late" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
