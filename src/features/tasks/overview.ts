import { currentConfig, type EngineConfig } from "@/shared/config";
import { addDays, dayKey, localTimeOf } from "@/shared/time";
import { firstOccurrence, parseRecurrence } from "./recurrence";

/**
 * The Tasks tab's view of habits and routines, separate from the database:
 * what each recurring thing is, when it next happens, and how far a routine
 * got today. A habit that hasn't started yet (set up after its time today)
 * still shows, with the day it starts — never as a blank.
 */

/** One day's row of a recurring habit. */
export interface SeriesRow {
  id: string;
  seriesId: string;
  title: string;
  recurrence: string | null;
  occursOn: string;
  dueAt: Date | null;
  status: "pending" | "done" | "skipped" | "cancelled";
  routine: { id: string; step: number } | null;
}

/** When something next happens. `time` null = any time that day. */
export interface NextAt {
  day: string;
  time: string | null;
}

export interface HabitSummary {
  seriesId: string;
  title: string;
  rule: string;
  next: NextAt | null;
  /** The open row to edit or complete, if one exists yet. */
  openId: string | null;
}

export interface RoutineSummary {
  id: string;
  title: string;
  rule: string | null;
  steps: string[];
  /** Today's progress, if the routine happens today. */
  today: { done: number; total: number; nextStep: string | null; nextId: string | null } | null;
  /** The next day it starts, if not (or no longer) today. */
  next: NextAt | null;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "FREQ=WEEKLY;BYDAY=MO,WE" → "Mon, Wed". Unreadable rules come back as they are. */
export function describeRecurrence(rule: string): string {
  let r;
  try {
    r = parseRecurrence(rule);
  } catch {
    return rule;
  }
  let base: string;
  if (r.freq === "daily") base = "Every day";
  else {
    const days = ORDER.filter((d) => r.days.has(d));
    const is = (set: number[]) => days.length === set.length && set.every((d) => r.days.has(d));
    base = is([1, 2, 3, 4, 5]) ? "Weekdays" : is([6, 0]) ? "Weekends" : is(ORDER) ? "Every day" : days.map((d) => WEEKDAY[d]).join(", ");
  }
  if (!r.until) return base;
  const until = new Date(`${r.until}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
  return `${base} until ${until}`;
}

/** "Today", "Tomorrow", "Fri" within the week, else "Fri 16 Oct". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = WEEKDAY[d.getUTCDay()]!;
  if (day > today && day < addDays(today, 7)) return weekday;
  return `${weekday} ${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}`;
}

/** 23:59 is how "any time that day" is stored. */
function timeOf(dueAt: Date | null, tz: string): string | null {
  if (!dueAt) return null;
  const t = localTimeOf(dueAt, tz);
  return t === "23:59" ? null : t;
}

/** One habit's next day: its earliest open row from today, else the first day its rule gives after the latest row. */
function nextFor(rows: readonly SeriesRow[], now: Date, tz: string): { next: NextAt | null; openId: string | null } {
  const today = dayKey(now, tz);
  const open = rows.filter((r) => r.status === "pending" && r.occursOn >= today).sort((a, b) => a.occursOn.localeCompare(b.occursOn))[0];
  if (open) return { next: { day: open.occursOn, time: timeOf(open.dueAt, tz) }, openId: open.id };
  const latest = [...rows].sort((a, b) => b.occursOn.localeCompare(a.occursOn))[0];
  if (!latest?.recurrence) return { next: null, openId: null };
  const time = timeOf(latest.dueAt, tz);
  const after = addDays(latest.occursOn, 1);
  const day = firstOccurrence(parseRecurrence(latest.recurrence), after > today ? after : today, { today, time: localTimeOf(now, tz) }, time);
  return { next: day ? { day, time } : null, openId: null };
}

/** Plain code-unit order: localeCompare would put "~" before digits. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Soonest first; any-time after timed on the same day; nothing scheduled last. */
const nextKey = (n: NextAt | null) => (n ? `${n.day} ${n.time ?? "99"}` : "~");
const byNext = (a: { next: NextAt | null }, b: { next: NextAt | null }) => cmp(nextKey(a.next), nextKey(b.next));

export function summariseSeries(
  rows: readonly SeriesRow[],
  routines: readonly { id: string; title: string }[],
  now: Date,
  config: EngineConfig = currentConfig(),
): { routines: RoutineSummary[]; habits: HabitSummary[] } {
  const tz = config.timeZone;
  const today = dayKey(now, tz);
  const bySeries = new Map<string, SeriesRow[]>();
  for (const r of rows) bySeries.set(r.seriesId, [...(bySeries.get(r.seriesId) ?? []), r]);
  const latestOf = (list: SeriesRow[]) => [...list].sort((a, b) => b.occursOn.localeCompare(a.occursOn))[0]!;

  const habits: HabitSummary[] = [];
  for (const [seriesId, list] of bySeries) {
    const latest = latestOf(list);
    if (latest.routine) continue;
    habits.push({ seriesId, title: latest.title, rule: describeRecurrence(latest.recurrence ?? ""), ...nextFor(list, now, tz) });
  }

  const summaries: RoutineSummary[] = routines.map((routine) => {
    const steps = [...bySeries.values()]
      .map(latestOf)
      .filter((l) => l.routine?.id === routine.id)
      .sort((a, b) => a.routine!.step - b.routine!.step);
    const todays = rows
      .filter((r) => r.routine?.id === routine.id && r.occursOn === today && r.status !== "cancelled")
      .sort((a, b) => a.routine!.step - b.routine!.step);
    const nextRow = todays.find((r) => r.status === "pending" || r.status === "skipped") ?? null;
    // Nothing left today (all done, or it hasn't started yet): when its earliest step comes round.
    const next = nextRow
      ? null
      : steps.map((s) => ({ next: nextFor(bySeries.get(s.seriesId)!, now, tz).next })).sort(byNext)[0]?.next ?? null;
    const first = steps[0];
    return {
      id: routine.id,
      title: routine.title,
      rule: first?.recurrence ? describeRecurrence(first.recurrence) : null,
      steps: steps.map((s) => s.title),
      today: todays.length > 0 ? { done: todays.filter((r) => r.status === "done").length, total: todays.length, nextStep: nextRow?.title ?? null, nextId: nextRow?.id ?? null } : null,
      next,
    };
  });

  // Routines still going today first, then by when they next start; empty ones last.
  const routineKey = (r: RoutineSummary) => (r.today?.nextId ? "0" : r.next ? `1 ${nextKey(r.next)}` : r.today ? "2" : "3");
  return { routines: summaries.sort((a, b) => cmp(routineKey(a), routineKey(b))), habits: habits.sort(byNext) };
}
