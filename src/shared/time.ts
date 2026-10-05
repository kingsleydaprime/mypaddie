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
