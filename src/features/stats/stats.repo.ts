import { PILLARS } from "@/shared/domain";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, zonedInstant } from "@/shared/time";
import { levelProgress } from "./levels";

/** The 11 pillars with levels, last week's XP per pillar, and recent slip reasons. */
export async function loadStats(db: Db, now: Date) {
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const fortnight = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const [pillars, recent, slips] = await Promise.all([
    db.from("pillars").select("name, xp"),
    db.from("xp_log").select("pillar, amount").gte("at", week),
    db.from("slips").select("why_category").gte("at", fortnight),
  ]);
  for (const res of [pillars, recent, slips]) if (res.error) throw new Error(`loading stats: ${res.error.message}`);

  const totals = new Map(pillars.data!.map((p) => [p.name, p.xp]));
  const lastWeek = new Map<string, number>();
  for (const r of recent.data!) lastWeek.set(r.pillar, (lastWeek.get(r.pillar) ?? 0) + r.amount);

  const reasons = new Map<string, number>();
  for (const s of slips.data!) {
    const c = s.why_category ?? "unspecified";
    reasons.set(c, (reasons.get(c) ?? 0) + 1);
  }

  return {
    pillars: PILLARS.map((name) => ({ name, ...levelProgress(totals.get(name) ?? 0), lastWeek: lastWeek.get(name) ?? 0 })),
    slipsLast14Days: {
      count: slips.data!.length,
      topReasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, times]) => ({ reason, times })),
    },
  };
}

export type Stats = Awaited<ReturnType<typeof loadStats>>;

/**
 * The XP strip on Home: overall level (all pillars together, on the same curve
 * as a pillar), what today has earned or cost so far, and the last 7 days.
 * Negative pillars don't pull the total down, as on Stats.
 */
export async function loadXpSummary(db: Db, now: Date, timeZone: string) {
  const dayStart = zonedInstant(dayKey(now, timeZone), "00:00", timeZone).getTime();
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [pillars, recent] = await Promise.all([
    db.from("pillars").select("xp"),
    db.from("xp_log").select("amount, at").gte("at", week),
  ]);
  for (const res of [pillars, recent]) if (res.error) throw new Error(`loading XP: ${res.error.message}`);
  const total = pillars.data!.reduce((s, p) => s + Math.max(0, p.xp), 0);
  let today = 0;
  let lastWeek = 0;
  for (const r of recent.data!) {
    lastWeek += r.amount;
    if (new Date(r.at).getTime() >= dayStart) today += r.amount;
  }
  return { ...levelProgress(total), today, lastWeek };
}

export type XpSummary = Awaited<ReturnType<typeof loadXpSummary>>;
