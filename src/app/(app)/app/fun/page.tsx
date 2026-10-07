import Link from "next/link";
import { didFunAction, removeFunAction, toggleFunAction } from "@/features/fun/fun.actions";
import { daysAgo } from "@/features/fun/fun";
import { loadFunPicture } from "@/features/fun/fun.repo";
import { FunForm } from "@/features/fun/ui/fun-form";
import { loadSchedule } from "@/features/settings/settings.repo";
import { formatNaira } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";

const ago = (days: number | null) => (days === null ? "never yet" : days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`);
const COMPANY = { solo: "alone", together: "with people", either: "alone or with people" } as const;

export default async function FunPage() {
  const db = await requireDb("/app/fun");
  const now = new Date();
  const [fun, schedule] = await Promise.all([loadFunPicture(db, now), loadSchedule(db)]);
  const active = fun.activities.filter((a) => a.active);
  const paused = fun.activities.filter((a) => !a.active);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Fun list</h1>
      </header>

      {fun.daysSinceFun !== null && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">
            {fun.daysSinceFun === 0 ? "You had fun today. Good." : `${fun.daysSinceFun} day${fun.daysSinceFun === 1 ? "" : "s"} since your last fun.`}
          </p>
          {fun.suggestions.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">Fits right now (money and mood):</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {fun.suggestions.map((s) => (
                  <li key={s.id} className="rounded-full border border-gold px-3 py-1 text-sm">{s.title}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing on the list fits your money or mood right now. Add something free.</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {schedule.funEveryDays > 0 ? `Paddie nudges you after ${schedule.funEveryDays} days without fun, at ${schedule.funAt}.` : "Fun nudges are off."} Change it in Settings.
          </p>
        </section>
      )}

      <details className="rounded-2xl border border-line bg-surface p-4" open={fun.activities.length === 0}>
        <summary className="cursor-pointer font-bold">+ Add something you enjoy</summary>
        <div className="mt-3"><FunForm /></div>
      </details>

      {fun.activities.length === 0 && (
        <p className="text-sm text-muted">Your list is empty. Add a few things — free ones too — and Paddie will suggest them when you&apos;ve earned a break.</p>
      )}

      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.title}</p>
                  <p className="text-sm text-muted">
                    {a.cost > 0 ? formatNaira(a.cost) : "Free"}
                    {a.minutes ? ` · ${a.minutes} min` : ""} · {a.energy} energy · {COMPANY[a.company]}
                  </p>
                  <p className="text-xs text-muted">Last: {ago(daysAgo(a.lastDoneAt, now))}{a.timesDone > 0 ? ` · ${a.timesDone}×` : ""}</p>
                </div>
                <form action={didFunAction.bind(null, a.id)}>
                  <button className="shrink-0 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold">Did it</button>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted">Edit</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <FunForm activity={a} />
                  <div className="flex gap-2">
                    <form action={toggleFunAction.bind(null, a.id, false)}>
                      <button className="rounded-xl border border-line px-3 py-2 text-sm">Pause</button>
                    </form>
                    <form action={removeFunAction.bind(null, a.id)}>
                      <button className="rounded-xl border border-line px-3 py-2 text-sm text-red">Remove</button>
                    </form>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {paused.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-muted">Paused — not suggested</h2>
          <ul className="flex flex-col gap-2">
            {paused.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <span className="truncate text-muted">{a.title}</span>
                <form action={toggleFunAction.bind(null, a.id, true)}>
                  <button className="text-sm font-semibold text-gold">Resume</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
