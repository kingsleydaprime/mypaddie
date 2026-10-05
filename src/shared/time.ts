/**
 * Calendar-day helpers. The engine never calls `new Date()` itself: callers
 * pass `now`, which is what makes every rule testable with fixed dates.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // en-CA formats as YYYY-MM-DD, which sorts and compares as a string.
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The local calendar day an instant falls on, as "YYYY-MM-DD". */
export function dayKey(at: Date, timeZone: string): string {
  return formatterFor(timeZone).format(at);
}

/** Whole calendar days from `from` to `to` in the given zone (negative if `to` is earlier). */
export function daysBetween(from: Date, to: Date, timeZone: string): number {
  const a = Date.parse(`${dayKey(from, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(to, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** True when `at` lies within the last `days` calendar days, counting today as day 1. */
export function withinLastDays(at: Date, now: Date, days: number, timeZone: string): boolean {
  const ago = daysBetween(at, now, timeZone);
  return ago >= 0 && ago < days;
}

/** The first instant of the local day after `at` — e.g. when "go easy on me" expires. */
export function startOfNextDay(at: Date, timeZone: string): Date {
  // Binary-search the first minute whose local day differs. No day is longer
  // than 25 hours, so `hi` is always in a later day. Works for zones with DST.
  const MINUTE = 60 * 1000;
  const today = dayKey(at, timeZone);
  let lo = Math.floor(at.getTime() / MINUTE); // still today
  let hi = lo + 26 * 60; // definitely a later day
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid * MINUTE), timeZone) === today) lo = mid;
    else hi = mid;
  }
  return new Date(hi * MINUTE);
}

/** "YYYY-MM-DD" shifted by whole calendar days. Pure date arithmetic, no zone involved. */
export function addDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Day of week for a "YYYY-MM-DD", 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Wall-clock "HH:MM" of an instant in the given zone. */
export function localTimeOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** Minutes the zone is ahead of UTC at a given instant (Lagos: +60). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant at which the wall clock in `timeZone` reads `day` `time`.
 * e.g. zonedInstant("2026-10-06", "07:00", "Africa/Lagos") → 06:00Z.
 * Guesses with the offset at the naive UTC reading, then corrects once,
 * which is exact except inside a DST gap (where the clock time doesn't exist).
 */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const naive = Date.parse(`${day}T${time}:00Z`);
  const first = naive - offsetMinutes(new Date(naive), timeZone) * 60000;
  return new Date(naive - offsetMinutes(new Date(first), timeZone) * 60000);
}

/** "YYYY-MM-DD HH:MM" in the given zone — how times are shown to the AI and to you. */
export function formatLocal(at: Date, timeZone: string): string {
  return `${dayKey(at, timeZone)} ${localTimeOf(at, timeZone)}`;
}

/** First instant of the local calendar month containing `at`. */
export function startOfMonth(at: Date, timeZone: string): Date {
  return zonedInstant(`${dayKey(at, timeZone).slice(0, 7)}-01`, "00:00", timeZone);
}
