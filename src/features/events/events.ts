import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { dayKey, daysBetween, localTimeOf, zonedInstant } from "@/shared/time";

export const EVENT_KINDS = ["meeting", "social", "birthday", "anniversary", "wedding", "appointment", "deadline", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Within this many days, an event is "close". */
export const CLOSE_DAYS = 7;
/** A timed event with no end is assumed to take this long. */
export const DEFAULT_EVENT_MINUTES = 60;

export interface EventLike {
  id: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  important: boolean;
  yearly: boolean;
  status: "upcoming" | "done" | "cancelled";
}

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * When an event next happens, on or after `today` (local date). One-off: its own
 * start. Yearly: the same local date this year, or next year once it's passed;
 * 29 Feb falls on the 28th in other years. Mirrors private.event_occurrence.
 */
export function nextOccurrence(e: Pick<EventLike, "startsAt" | "yearly">, today: string, config: EngineConfig = DEFAULT_CONFIG): Date {
  const tz = config.timeZone;
  const startDay = dayKey(e.startsAt, tz);
  if (!e.yearly || startDay >= today) return e.startsAt;
  const [, m, d] = startDay.split("-").map(Number) as [number, number, number];
  const time = localTimeOf(e.startsAt, tz);
  const year0 = Number(today.slice(0, 4));
  for (const year of [year0, year0 + 1]) {
    const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
    const candidate = `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate >= today) return zonedInstant(candidate, time, tz);
  }
  throw new Error("unreachable");
}

export type Quadrant = "prepare_now" | "plan_ahead" | "fit_in" | "someday";

/** Important × close. The four ways an event deserves attention. */
export function quadrant(important: boolean, daysAway: number, closeDays = CLOSE_DAYS): Quadrant {
  const close = daysAway <= closeDays;
  if (important) return close ? "prepare_now" : "plan_ahead";
  return close ? "fit_in" : "someday";
}

export interface EventView {
  id: string;
  title: string;
  kind: EventKind;
  at: Date;
  allDay: boolean;
  important: boolean;
  daysAway: number;
  quadrant: Quadrant;
}

/** Upcoming events within `horizonDays`, by occurrence, with their quadrant. */
export function upcoming(events: readonly EventLike[], now: Date, horizonDays: number, config: EngineConfig = DEFAULT_CONFIG): EventView[] {
  const tz = config.timeZone;
  const today = dayKey(now, tz);
  return events
    .filter((e) => e.status === "upcoming")
    .map((e) => {
      const at = nextOccurrence(e, today, config);
      const daysAway = daysBetween(now, at, tz);
      return { id: e.id, title: e.title, kind: e.kind, at, allDay: e.allDay, important: e.important, daysAway, quadrant: quadrant(e.important, daysAway) };
    })
    .filter((v) => v.daysAway >= 0 && v.daysAway <= horizonDays && (v.allDay || v.daysAway > 0 || v.at.getTime() >= now.getTime() - 60 * 60_000))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The time block an event takes on a given day — for clashes and capacity. All-day events take none. */
export function blockOn(e: EventLike, day: string, config: EngineConfig = DEFAULT_CONFIG): { start: Date; minutes: number } | null {
  if (e.status !== "upcoming" || e.allDay) return null;
  const at = nextOccurrence(e, day, config);
  if (dayKey(at, config.timeZone) !== day) return null;
  const minutes = e.endsAt ? Math.max(1, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000)) : DEFAULT_EVENT_MINUTES;
  return { start: at, minutes };
}
