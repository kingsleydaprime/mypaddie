import { loadValues } from "@/features/values/values.repo";
import { currentConfig } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import { loadSchedule } from "@/features/settings/settings.repo";
import { periodOf, QUESTIONS, reviewsOwed, themesFor, weekLabel, type ReviewPeriod, type ThemePeriod, type WeekStart } from "./periods";

const tz = () => currentConfig().timeZone;
/** Where their week starts (Sunday or Monday), from their settings. */
const weekStartOf = async (db: Db): Promise<WeekStart> => (await loadSchedule(db)).weekStart;

export interface Theme {
  id: string;
  period: ThemePeriod;
  startsOn: string;
  title: string;
  focus: string[];
  notNow: string[];
  notes: string | null;
}

export async function loadThemes(db: Db): Promise<Theme[]> {
  const { data, error } = await db.from("themes").select("id, period, starts_on, title, focus, not_now, notes").order("starts_on", { ascending: false });
  if (error) throw new Error(`loading themes: ${error.message}`);
  return data.map((t) => ({ id: t.id, period: t.period as ThemePeriod, startsOn: t.starts_on, title: t.title, focus: t.focus, notNow: t.not_now, notes: t.notes }));
}

/** Set (or replace) the theme for the year / quarter / month containing `day`. */
export async function setTheme(db: Db, input: { period: ThemePeriod; day: string; title: string; focus?: string[]; notNow?: string[]; notes?: string | null }) {
  const p = periodOf(input.period, input.day);
  const { error } = await db.from("themes").upsert(
    {
      period: input.period,
      starts_on: p.start,
      title: input.title.trim(),
      focus: (input.focus ?? []).map((f) => f.trim()).filter(Boolean),
      not_now: (input.notNow ?? []).map((f) => f.trim()).filter(Boolean),
      notes: input.notes?.trim() || null,
    },
    { onConflict: "user_id,period,starts_on" },
  );
  if (error) throw new Error(`saving the theme: ${error.message}`);
  return { result: "set" as const, period: input.period, covers: p.label, title: input.title.trim() };
}

export async function currentThemes(db: Db, now: Date) {
  return themesFor(await loadThemes(db), dayKey(now, tz()));
}

/** Which reviews are owed today. */
export async function owedReviews(db: Db, now: Date) {
  const [{ data }, weekStart] = await Promise.all([db.from("reviews").select("period, starts_on"), weekStartOf(db)]);
  return reviewsOwed(dayKey(now, tz()), new Set((data ?? []).map((r) => `${r.period}:${r.starts_on}`)), weekStart);
}

/**
 * What actually happened in a period: the facts a review is written from.
 * Counts and short lists only — the AI writes the report.
 */
export async function reviewDigest(db: Db, period: ReviewPeriod, day: string) {
  const weekStart = await weekStartOf(db);
  const p = periodOf(period, day, weekStart);
  const from = zonedInstant(p.start, "00:00", tz()).toISOString();
  const to = zonedInstant(addDays(p.end, 1), "00:00", tz()).toISOString();
  const prev = periodOf(period, addDays(p.start, -1), weekStart);
  const [done, xp, slips, promises, money, learning, workouts, contacts, ticks, achievements, checkins, previous, themes, decisions, values] = await Promise.all([
    db.from("tasks").select("title, series_id").eq("status", "done").gte("done_at", from).lt("done_at", to),
    db.from("xp_log").select("pillar, amount, reason").gte("at", from).lt("at", to),
    db.from("slips").select("why, at, tasks(title)").gte("at", from).lt("at", to),
    db.from("promises").select("person, what, status, due_at").gte("due_at", from).lt("due_at", to),
    db.from("transactions").select("direction, amount, tag, kind").eq("kind", "normal").is("voided_at", null).gte("at", from).lt("at", to),
    db.from("learning_sessions").select("minutes, skills(name)").gte("at", from).lt("at", to),
    db.from("workout_logs").select("id", { count: "exact", head: true }).gte("at", from).lt("at", to),
    db.from("people_contacts").select("people(name)").gte("at", from).lt("at", to),
    db.from("list_items").select("text, lists(title)").gte("done_at", from).lt("done_at", to),
    db.from("achievements").select("key, detail").gte("earned_at", from).lt("earned_at", to),
    db.from("checkins").select("energy, sleep_hours, mood, screen_minutes").gte("day", p.start).lte("day", p.end),
    db.from("reviews").select("answers").eq("period", period).eq("starts_on", prev.start).maybeSingle(),
    loadThemes(db),
    db.from("decisions").select("decision").gte("decided_on", p.start).lte("decided_on", p.end),
    loadValues(db),
  ]);

  const tally = <T>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  };
  const xpRows = xp.data ?? [];
  const byPillar = new Map<string, number>();
  for (const r of xpRows) byPillar.set(r.pillar, (byPillar.get(r.pillar) ?? 0) + r.amount);
  const tx = money.data ?? [];
  const average = (xs: (number | null)[]) => {
    const n = xs.filter((x): x is number => x !== null);
    return n.length ? { average: Math.round((10 * n.reduce((a, b) => a + b, 0)) / n.length) / 10, days: n.length } : null;
  };
  const days = checkins.data ?? [];
  const theme = themesFor(themes, p.start);

  return {
    period,
    label: p.label,
    from: p.start,
    to: p.end,
    theme: Object.fromEntries(Object.entries(theme).map(([k, t]) => [k, { title: t!.title, focus: t!.focus, notNow: t!.notNow }])),
    lastTimeSaidToChange: (previous.data?.answers as Record<string, string> | undefined)?.change ?? null,
    done: { count: (done.data ?? []).length, most: tally(done.data ?? [], (t) => t.title).slice(0, 8) },
    xpByPillar: Object.fromEntries([...byPillar].sort((a, b) => b[1] - a[1])),
    // XP rows are one per pillar, so report XP lost rather than a count of tasks.
    xpLostToIgnoredNeeds: -xpRows.filter((r) => r.reason === "ignored_need").reduce((s, r) => s + r.amount, 0),
    xpLostToBrokenPromises: -xpRows.filter((r) => r.reason === "broken_promise").reduce((s, r) => s + r.amount, 0),
    slips: (slips.data ?? []).map((s) => ({ task: (s.tasks as { title: string } | null)?.title ?? "", why: s.why })).slice(0, 10),
    promises: { kept: (promises.data ?? []).filter((x) => x.status === "kept").length, broken: (promises.data ?? []).filter((x) => x.status === "broken").map((x) => `${x.what} (to ${x.person})`) },
    money: {
      in: tx.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0),
      out: tx.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0),
      wants: tx.filter((t) => t.direction === "out" && t.tag === "want").reduce((s, t) => s + t.amount, 0),
    },
    study: [...(learning.data ?? []).reduce((m, l) => {
      const name = (l.skills as { name: string } | null)?.name ?? "study";
      return m.set(name, (m.get(name) ?? 0) + l.minutes);
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([skill, minutes]) => ({ skill, minutes })),
    workouts: workouts.count ?? 0,
    peopleTalkedTo: tally(contacts.data ?? [], (c) => (c.people as { name: string } | null)?.name ?? "someone").map((p) => p.name),
    bucketListDone: (ticks.data ?? []).map((t) => t.text),
    achievements: (achievements.data ?? []).map((a) => a.key),
    // Averages over the days they logged; get_trends shows how these compare with before.
    checkins: {
      energy: average(days.map((c) => c.energy)),
      sleepHours: average(days.map((c) => c.sleep_hours)),
      mood: average(days.map((c) => c.mood)),
      screenHours: average(days.map((c) => (c.screen_minutes === null ? null : c.screen_minutes / 60))),
    },
    values: values.map((v) => v.value),
    decisions: (decisions.data ?? []).map((d) => d.decision),
    questions: QUESTIONS[period],
  };
}

export async function saveReview(db: Db, input: { period: ReviewPeriod; day: string; answers: Record<string, string>; summary?: string | null }) {
  const p = periodOf(input.period, input.day, await weekStartOf(db));
  const { error } = await db.from("reviews").upsert(
    { period: input.period, starts_on: p.start, ends_on: p.end, answers: input.answers as { [key: string]: Json }, summary: input.summary?.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,period,starts_on" },
  );
  if (error) throw new Error(`saving the review: ${error.message}`);
  return { result: "saved" as const, period: input.period, label: p.label };
}

export async function loadReviews(db: Db, limit = 30) {
  const { data, error } = await db.from("reviews").select("id, period, starts_on, ends_on, answers, summary, updated_at").order("starts_on", { ascending: false }).limit(limit);
  if (error) throw new Error(`loading reviews: ${error.message}`);
  // A saved week is labelled from its own first day, whichever day their week started on back then.
  return data.map((r) => ({
    ...r,
    label: r.period === "week" ? weekLabel(r.starts_on) : periodOf(r.period as ReviewPeriod, r.starts_on).label,
    answers: r.answers as Record<string, string>,
  }));
}
