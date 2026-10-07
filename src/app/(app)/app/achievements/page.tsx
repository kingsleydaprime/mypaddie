import Link from "next/link";
import { checkAchievements, loadAchievements } from "@/features/achievements/achievements.repo";
import { requireDb } from "@/shared/supabase/session";

export default async function AchievementsPage() {
  const db = await requireDb("/app/achievements");
  await checkAchievements(db, new Date());
  const all = await loadAchievements(db);
  const earned = all.filter((a) => a.earnedAt).sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!));
  const toGo = all.filter((a) => !a.earnedAt);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/growth" className="text-muted" aria-label="Back to growth">‹ Growth</Link>
        <h1 className="text-2xl font-bold">Achievements</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">{earned.length} of {all.length} earned.</p>
      <ul className="grid grid-cols-2 gap-3">
        {earned.map((a) => (
          <li key={a.key} className="rounded-2xl border border-gold bg-surface p-3">
            <p className="font-semibold">🏆 {a.title}</p>
            <p className="text-xs text-muted">{a.description}{a.detail ? ` — ${a.detail}` : ""}</p>
            <p className="mt-1 text-xs text-muted">{a.earnedAt!.slice(0, 10)}</p>
          </li>
        ))}
        {toGo.map((a) => (
          <li key={a.key} className="rounded-2xl border border-line p-3 opacity-60">
            <p className="font-semibold">{a.title}</p>
            <p className="text-xs text-muted">{a.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
