import { currentConfig, type EngineConfig } from "@/shared/config";
import { addDays, dayKey, localTimeOf, weekdayOf, zonedInstant } from "@/shared/time";

/**
 * The subset of iCalendar RRULE that habits need:
 *   FREQ=DAILY                     every day
 *   FREQ=WEEKLY;BYDAY=MO,WE,FR     on those weekdays
 * Anything else (INTERVAL, COUNT, UNTIL, MONTHLY…) is rejected loudly rather
 * than half-understood.
 */
export type Recurrence = { freq: "daily" } | { freq: "weekly"; days: ReadonlySet<number> };

export class InvalidRecurrenceError extends Error {
  constructor(rule: string, why: string) {
    super(`unsupported recurrence "${rule}": ${why}`);
    this.name = "InvalidRecurrenceError";
  }
}

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRecurrence(rule: string): Recurrence {
  const body = rule.trim().replace(/^RRULE:/i, "");
  const parts = new Map<string, string>();
  for (const part of body.split(";").filter(Boolean)) {
    const [key, value] = part.split("=");
    if (!key || value === undefined) throw new InvalidRecurrenceError(rule, `bad part "${part}"`);
    parts.set(key.toUpperCase(), value.toUpperCase());
  }

  const freq = parts.get("FREQ");
  const extra = [...parts.keys()].filter((k) => k !== "FREQ" && k !== "BYDAY");
  if (extra.length) throw new InvalidRecurrenceError(rule, `${extra.join(", ")} not supported`);

  if (freq === "DAILY") {
    if (parts.has("BYDAY")) throw new InvalidRecurrenceError(rule, "use FREQ=WEEKLY with BYDAY");
    return { freq: "daily" };
  }
  if (freq === "WEEKLY") {
    const byday = parts.get("BYDAY");
    if (!byday) throw new InvalidRecurrenceError(rule, "WEEKLY needs BYDAY");
    const days = new Set<number>();
    for (const d of byday.split(",")) {
      const n = WEEKDAYS[d];
      if (n === undefined) throw new InvalidRecurrenceError(rule, `unknown day "${d}"`);
      days.add(n);
    }
    return { freq: "weekly", days };
  }
  throw new InvalidRecurrenceError(rule, `FREQ must be DAILY or WEEKLY`);
}

export function occursOn(recurrence: Recurrence, day: string): boolean {
  return recurrence.freq === "daily" || recurrence.days.has(weekdayOf(day));
}

/** The latest existing row of a recurring habit — the template for new days. */
export interface SeriesForSpawn {
  seriesId: string;
  rule: string;
  /** Local day of the latest existing row. */
  lastOccursOn: string;
  /** Its due time; new rows keep the same wall-clock time. Null = no due time. */
  lastDueAt: Date | null;
}

export interface OccurrenceToSpawn {
  seriesId: string;
  occursOn: string;
  dueAt: Date | null;
}

/**
 * Which days need a row created, from the day after the latest existing row
 * up to today — but never further back than `backfillDays`. Missed days are
 * backfilled on purpose: an unopened app doesn't make the habit disappear,
 * so those needs can still be counted as ignored. The cap keeps a long
 * absence from turning into a wall of deductions.
 */
export function planOccurrences(
  series: readonly SeriesForSpawn[],
  now: Date,
  backfillDays = 7,
  config: EngineConfig = currentConfig(),
): OccurrenceToSpawn[] {
  const tz = config.timeZone;
  const today = dayKey(now, tz);
  const earliest = addDays(today, -(backfillDays - 1));
  const out: OccurrenceToSpawn[] = [];

  for (const s of series) {
    const recurrence = parseRecurrence(s.rule);
    const time = s.lastDueAt ? localTimeOf(s.lastDueAt, tz) : null;
    let day = addDays(s.lastOccursOn, 1);
    if (day < earliest) day = earliest;
    for (; day <= today; day = addDays(day, 1)) {
      if (!occursOn(recurrence, day)) continue;
      out.push({ seriesId: s.seriesId, occursOn: day, dueAt: time ? zonedInstant(day, time, tz) : null });
    }
  }
  return out;
}

export interface SeriesTemplate {
  seriesId: string;
  title: string;
  rule: string;
  lastOccursOn: string;
  lastDueAt: Date | null;
  durationMinutes: number | null;
}

/**
 * Habit days that will happen but haven't been created yet (rows are created
 * each morning). Capacity and clash checks for future days need them, or a
 * day full of habits looks empty. Days already created are real rows, so only
 * days after the latest row are projected.
 */
export function projectedOccurrences(series: readonly SeriesTemplate[], day: string, config: EngineConfig = currentConfig()) {
  return series.flatMap((s) => {
    if (day <= s.lastOccursOn || !occursOn(parseRecurrence(s.rule), day)) return [];
    return [
      {
        id: `habit:${s.seriesId}:${day}`,
        title: s.title,
        dueAt: s.lastDueAt ? zonedInstant(day, localTimeOf(s.lastDueAt, config.timeZone), config.timeZone) : null,
        durationMinutes: s.durationMinutes,
        status: "pending" as const,
      },
    ];
  });
}
