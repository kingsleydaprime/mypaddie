import type { Db } from "@/shared/supabase/token-client";
import { loadStats } from "../stats.repo";

const label = (name: string) => name[0]!.toUpperCase() + name.slice(1);

export async function StatsScreen({ db }: { db: Db }) {
  const stats = await loadStats(db, new Date());
  const ranked = [...stats.pillars].sort((a, b) => b.xp - a.xp);
  const totalXp = stats.pillars.reduce((s, p) => s + Math.max(0, p.xp), 0);
  const weekXp = stats.pillars.reduce((s, p) => s + p.lastWeek, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="mt-1 text-sm text-muted">
          {totalXp} XP total · {weekXp >= 0 ? "+" : ""}
          {weekXp} this week
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {ranked.map((p) => (
          <li key={p.name} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{label(p.name)}</span>
              <span className="text-sm text-muted">
                Lv {p.level} · {p.xp} XP
                {p.lastWeek !== 0 && (
                  <span className={p.lastWeek > 0 ? "text-green" : "text-red"}>
                    {" "}
                    {p.lastWeek > 0 ? "+" : ""}
                    {p.lastWeek}
                  </span>
                )}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={`${label(p.name)} level ${p.level}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(p.progress * 100)}
            >
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round(p.progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{p.toNext} XP to level {p.level + 1}</p>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Slips, last 14 days</h2>
        {stats.slipsLast14Days.count === 0 ? (
          <p className="mt-1 text-sm text-muted">None. Suspiciously clean.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">{stats.slipsLast14Days.count} logged. Most common reasons:</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {stats.slipsLast14Days.topReasons.map((r) => (
                <li key={r.reason} className="flex justify-between">
                  <span>{r.reason}</span>
                  <span className="text-muted">×{r.times}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
