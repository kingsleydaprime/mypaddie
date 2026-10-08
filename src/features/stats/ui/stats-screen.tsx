import Link from "next/link";
import type { Db } from "@/shared/supabase/token-client";
import { loadLearning } from "@/features/learning/learning.repo";
import { loadTraining } from "@/features/workouts/workouts.repo";
import { loadStats } from "../stats.repo";

const label = (name: string) => name[0]!.toUpperCase() + name.slice(1);

export async function StatsScreen({ db }: { db: Db }) {
  const now = new Date();
  const [stats, learning, training] = await Promise.all([loadStats(db, now), loadLearning(db, now), loadTraining(db, now)]);
  const activeSkills = learning.filter((l) => l.skill.status === "active");
  const ranked = [...stats.pillars].sort((a, b) => b.xp - a.xp);
  const totalXp = stats.pillars.reduce((s, p) => s + Math.max(0, p.xp), 0);
  const weekXp = stats.pillars.reduce((s, p) => s + p.lastWeek, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/app/more" className="text-sm text-muted" aria-label="Back to others">‹ Others</Link>
        <h1 className="mt-1 text-2xl font-bold">Stats</h1>
        <p className="mt-1 text-sm text-muted">
          {totalXp} XP total · {weekXp >= 0 ? "+" : ""}
          {weekXp} this week
        </p>
      </header>

      <Link href="/app/life" className="rounded-2xl border border-line bg-surface p-4">
        <span className="font-semibold">Your life <span className="text-gold">›</span></span>
        <span className="block text-sm text-muted">Every area at a glance, the one to work on this week, and your timeline.</span>
      </Link>

      <Link href="/app/stats/trends" className="rounded-2xl border border-line bg-surface p-4">
        <span className="font-semibold">Trends and experiments <span className="text-gold">›</span></span>
        <span className="block text-sm text-muted">Sleep, mood, screen time, study, spending and your word — week by week.</span>
      </Link>

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
        <h2 className="font-bold">Training</h2>
        {training.lastWorkout === null ? (
          <p className="mt-1 text-sm text-muted">No workouts logged yet. Tell Paddie your plan, then log what you did.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              {training.last7} this week · {training.last30} in the last 30 days
            </p>
            {training.bests.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {training.bests.slice(0, 5).map((b) => (
                  <li key={b.exercise} className="flex justify-between">
                    <span>{b.exercise}</span>
                    <span className="text-muted">
                      {b.best.weightKg ? `${b.best.weightKg}kg × ${b.best.reps ?? "?"}` : b.best.seconds ? `${b.best.seconds}s` : `${b.best.reps ?? "?"} reps`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Learning</h2>
        {activeSkills.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
            Nothing logged yet. Tell Paddie &ldquo;did 45 min of DSA, sliding window&rdquo;.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activeSkills.map(({ skill, summary }) => (
              <li key={skill.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{skill.name}</span>
                  <span className="text-xs text-muted">{label(skill.pillar)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {(summary.last30Minutes / 60).toFixed(1)}h last 30 days
                  {summary.streakDays > 0 && <span className="text-gold"> · {summary.streakDays}-day streak</span>}
                  {Object.entries(summary.counts).map(([unit, n]) => ` · ${n} ${unit}`).join("")}
                </p>
                {summary.reviewDue.length > 0 && (
                  <p className="mt-1 text-sm">
                    <span className="font-medium text-gold">Review: </span>
                    {summary.reviewDue.slice(0, 4).map((t) => t.topic).join(", ")}
                    {summary.reviewDue.length > 4 && ` +${summary.reviewDue.length - 4}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
