import { isBucketList } from "@/features/lists/lists";
import { loadBudget } from "@/features/money/money.repo";
import { levelFor } from "@/features/stats/levels";
import { completeTask, createTask } from "@/features/tasks/tasks.repo";
import type { Db } from "@/shared/supabase/token-client";
import { ACHIEVEMENT_WEIGHTS, ACHIEVEMENT_XP, ACHIEVEMENTS, longestRun, newlyEarned, type LifeStats } from "./achievements";

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/** The numbers achievements are judged on, from what's already recorded. */
export async function loadLifeStats(db: Db, now: Date): Promise<LifeStats> {
  const [tasksDone, habitRows, workouts, study, budget, kept, ticks, contacts, reviews, fun, pillars] = await Promise.all([
    count(db.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").not("title", "like", "Achievement:%")),
    db.from("tasks").select("series_id, title, occurs_on").eq("status", "done").not("series_id", "is", null).not("occurs_on", "is", null),
    count(db.from("workout_logs").select("id", { count: "exact", head: true })),
    db.from("learning_sessions").select("minutes"),
    loadBudget(db, now),
    count(db.from("promises").select("id", { count: "exact", head: true }).eq("status", "kept")),
    db.from("list_items").select("done_at, lists(title)").not("done_at", "is", null),
    count(db.from("people_contacts").select("id", { count: "exact", head: true })),
    count(db.from("reviews").select("id", { count: "exact", head: true })),
    db.from("fun_activities").select("times_done"),
    db.from("pillars").select("xp"),
  ]);
  const bySeries = new Map<string, { title: string; days: string[] }>();
  for (const r of habitRows.data ?? []) {
    const e = bySeries.get(r.series_id!) ?? { title: r.title, days: [] };
    e.days.push(r.occurs_on!);
    bySeries.set(r.series_id!, e);
  }
  let bestStreak: LifeStats["bestStreak"] = null;
  for (const { title, days } of bySeries.values()) {
    const run = longestRun(days);
    if (!bestStreak || run > bestStreak.days) bestStreak = { days: run, habit: title };
  }
  return {
    tasksDone,
    bestStreak,
    workouts,
    studyMinutes: (study.data ?? []).reduce((s, r) => s + r.minutes, 0),
    saved: budget.buckets.savings + budget.buckets.buffer,
    bufferFull: budget.bufferTarget > 0 && budget.buckets.buffer >= budget.bufferTarget,
    promisesKeptOnTime: kept,
    bucketTicks: (ticks.data ?? []).filter((t) => isBucketList((t.lists as { title: string } | null)?.title ?? "")).length,
    contacts,
    reviews,
    funTimes: (fun.data ?? []).reduce((s, r) => s + r.times_done, 0),
    topLevel: Math.max(1, ...(pillars.data ?? []).map((p) => levelFor(p.xp))),
  };
}

/**
 * Records anything newly earned (once each — the table refuses a repeat) and
 * pays its bonus through a task done on the spot. Returns what's new, to
 * celebrate.
 */
export async function checkAchievements(db: Db, now: Date) {
  const [{ data: held }, stats] = await Promise.all([db.from("achievements").select("key"), loadLifeStats(db, now)]);
  const fresh = newlyEarned(stats, new Set((held ?? []).map((h) => h.key)));
  const earned = [];
  for (const a of fresh) {
    const { error } = await db.from("achievements").insert({ key: a.key, earned_at: now.toISOString(), detail: a.detail ?? null });
    if (error) continue; // earned a moment ago by a parallel request
    const task = await createTask(db, { title: `Achievement: ${a.title}`, itemId: null, baseXp: ACHIEVEMENT_XP, dueDate: null, dueTime: null, recurrence: null, nonNegotiable: false, weights: ACHIEVEMENT_WEIGHTS }, now);
    if (task.result === "created") await completeTask(db, task.task.id, now);
    earned.push(a);
  }
  return earned;
}

/** Everything: held (with when and what for) and still to earn. */
export async function loadAchievements(db: Db) {
  const { data } = await db.from("achievements").select("key, earned_at, detail");
  const held = new Map((data ?? []).map((a) => [a.key, a]));
  return ACHIEVEMENTS.map((a) => ({ key: a.key, title: a.title, description: a.description, earnedAt: held.get(a.key)?.earned_at ?? null, detail: held.get(a.key)?.detail ?? null }));
}
