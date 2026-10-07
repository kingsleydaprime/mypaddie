import { eventBlocksOn } from "@/features/events/events.repo";
import { loadFunPicture } from "@/features/fun/fun.repo";
import { DEFAULT_DURATION, roomOn } from "@/features/tasks/capacity";
import { projectedOccurrences } from "@/features/tasks/recurrence";
import { loadCapacity, loadDayTasks, loadSeriesTemplates, updateTask } from "@/features/tasks/tasks.repo";
import { DEFAULT_CONFIG } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { CHORE_MAX_XP, planDay, type FixedBlock, type FlexibleTask } from "./plan";

const tz = DEFAULT_CONFIG.timeZone;
/** Stored for "any time that day" — not a real time. */
const ANY_TIME = "23:59";

type Row = {
  id: string;
  title: string;
  due_at: string | null;
  duration_minutes: number | null;
  is_non_negotiable: boolean;
  must_from: string | null;
  base_xp: number;
  series_id: string | null;
  occurs_on: string | null;
  items: { tier: string } | null;
};

/**
 * Builds the day's plan from real data: timed tasks and events are fixed;
 * tasks for the day without a time are placed; when planning today, open
 * undated tasks are added too — but only while the day's capacity allows.
 */
export async function proposeDay(db: Db, day: string, now: Date) {
  const from = zonedInstant(day, "00:00", tz).toISOString();
  const to = zonedInstant(addDays(day, 1), "00:00", tz).toISOString();
  const isToday = day === dayKey(now, tz);
  const cols = "id, title, due_at, duration_minutes, is_non_negotiable, must_from, base_xp, series_id, occurs_on, items(tier)";

  const [onDay, habitsAnyTime, undated, events, schedule, templates] = await Promise.all([
    db.from("tasks").select(cols).eq("status", "pending").gte("due_at", from).lt("due_at", to).returns<Row[]>(),
    db.from("tasks").select(cols).eq("status", "pending").eq("occurs_on", day).is("due_at", null).returns<Row[]>(),
    isToday
      ? db.from("tasks").select(cols).eq("status", "pending").is("due_at", null).is("series_id", null).returns<Row[]>()
      : Promise.resolve({ data: [] as Row[], error: null }),
    eventBlocksOn(db, day),
    loadSchedule(db),
    loadSeriesTemplates(db),
  ]);
  for (const r of [onDay, habitsAnyTime, undated] as { error: { message: string } | null }[]) if (r.error) throw new Error(`loading the day: ${r.error.message}`);

  const endOfDay = zonedInstant(day, "23:59", tz).getTime();
  type Flex = FlexibleTask & { habit: boolean; undated: boolean };
  const flex = (r: Row, extra: Partial<Flex> = {}): Flex => ({
    id: r.id,
    title: r.title,
    minutes: r.duration_minutes ?? DEFAULT_DURATION,
    must: r.is_non_negotiable || (r.must_from !== null && Date.parse(r.must_from) <= endOfDay),
    need: r.items?.tier === "need",
    chore: r.base_xp <= CHORE_MAX_XP,
    habit: r.series_id !== null,
    undated: false,
    ...extra,
  });

  const fixed: FixedBlock[] = events.map((e) => ({ id: e.id, title: e.title, start: e.dueAt!, minutes: e.durationMinutes!, kind: "event" }));
  const flexible: Flex[] = [];
  for (const r of onDay.data!) {
    const due = new Date(r.due_at!);
    if (localTimeOf(due, tz) === ANY_TIME) flexible.push(flex(r));
    else fixed.push({ id: r.id, title: r.title, start: due, minutes: r.duration_minutes ?? DEFAULT_DURATION, kind: "task" });
  }
  for (const r of habitsAnyTime.data!) flexible.push(flex(r));

  // Habit days not created yet (planning ahead): timed ones are fixed, the
  // rest are suggestions — like any habit, planning never writes their time.
  for (const p of projectedOccurrences(templates, day)) {
    if (p.dueAt) fixed.push({ id: p.id, title: p.title, start: p.dueAt, minutes: p.durationMinutes ?? DEFAULT_DURATION, kind: "task" });
    else flexible.push({ id: p.id, title: p.title, minutes: p.durationMinutes ?? DEFAULT_DURATION, must: false, need: false, chore: false, habit: true, undated: false });
  }

  // Undated tasks join today's plan only while capacity allows, most important first.
  const overCapacity: { id: string; title: string; minutes: number }[] = [];
  if (undated.data!.length) {
    let room = roomOn(day, await loadDayTasks(db, day), await loadCapacity(db), now, undefined, dayEndsAt(schedule)).available;
    const candidates = undated.data!.map((r) => flex(r, { undated: true })).sort((a, b) => Number(b.must) - Number(a.must) || Number(b.need) - Number(a.need));
    for (const c of candidates) {
      if (c.minutes <= room) {
        flexible.push(c);
        room -= c.minutes;
      } else overCapacity.push({ id: c.id, title: c.title, minutes: c.minutes });
    }
  }

  const plan = planDay({ day, now, fixed, flexible, meals: schedule.meals, window: { start: schedule.quietEnd, end: dayEndsAt(schedule) } });
  const habitIds = new Set(flexible.filter((f) => f.habit).map((f) => f.id));

  // Free time gets an idea from his fun list that fits the gap (time, money, mood).
  const free = plan.slots.find((s) => s.kind === "free");
  const funIdea = free
    ? (await loadFunPicture(db, now, { minutesFree: Math.round((free.end.getTime() - free.start.getTime()) / 60_000), limit: 1 })).suggestions[0] ?? null
    : null;
  return {
    ...plan,
    funIdea: funIdea ? { title: funIdea.title, cost: funIdea.cost, minutes: funIdea.minutes } : null,
    // Habit rows are suggested but not written (see acceptDay).
    assignments: plan.assignments.map((a) => ({ ...a, suggestionOnly: habitIds.has(a.taskId) })),
    overCapacity,
  };
}

/**
 * Writes the accepted times. Each goes through updateTask, so a time he tweaked
 * into a clash is caught. Habit rows are skipped: a new day of a habit copies
 * its latest row, so fixing today's time would quietly change the habit
 * forever — that's a deliberate update_task, not a side effect of planning.
 */
export async function acceptDay(db: Db, day: string, assignments: { taskId: string; time: string }[], now: Date) {
  const results = [];
  for (const a of assignments) {
    const { data: t } = await db.from("tasks").select("id, title, series_id").eq("id", a.taskId).maybeSingle();
    if (!t) {
      results.push({ taskId: a.taskId, result: "not_found" });
      continue;
    }
    if (t.series_id) {
      results.push({ taskId: a.taskId, title: t.title, result: "habit_not_fixed" });
      continue;
    }
    const outcome = await updateTask(db, a.taskId, { dueDate: day, dueTime: a.time }, "edit", now);
    results.push({ taskId: a.taskId, title: t.title, ...outcome });
  }
  return results;
}
