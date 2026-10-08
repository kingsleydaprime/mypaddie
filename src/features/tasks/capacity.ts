import { currentConfig, type EngineConfig } from "@/shared/config";
import { dayKey, zonedInstant } from "@/shared/time";

/** Minutes assumed for a task with no duration — for capacity and for clashes. */
export const DEFAULT_DURATION = 30;
/** The waking part of a day: from when quiet hours end to when they start ("HH:MM"). */
export interface ActiveDay {
  startsAt: string;
  endsAt: string;
}

/** Default active day: quiet hours 22:00 → 07:00. */
export const DEFAULT_ACTIVE_DAY: ActiveDay = { startsAt: "07:00", endsAt: "22:00" };

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface CapacityPeriod {
  /** Inclusive local dates, "YYYY-MM-DD". */
  from: string;
  to: string;
  minutes: number;
  label?: string | null;
}

export interface CapacitySetting {
  defaultMinutes: number;
  /** Date ranges that override the default — exam weeks, holidays. Later entries win. */
  periods: CapacityPeriod[];
}

export const DEFAULT_CAPACITY: CapacitySetting = { defaultMinutes: 6 * 60, periods: [] };

export interface DayTask {
  id: string;
  title: string;
  dueAt: Date | null;
  durationMinutes: number | null;
  status: "pending" | "done" | "skipped" | "cancelled";
  /** Routines, workouts, looking after yourself: takes time in the day, not from your work hours. */
  selfCare?: boolean;
}

export function capacityFor(day: string, setting: CapacitySetting): { minutes: number; label: string | null } {
  const period = [...setting.periods].reverse().find((p) => p.from <= day && day <= p.to);
  return period ? { minutes: period.minutes, label: period.label ?? null } : { minutes: setting.defaultMinutes, label: null };
}

const minutesOf = (t: DayTask) => t.durationMinutes ?? DEFAULT_DURATION;

export interface DayRoom {
  day: string;
  /** Work hours for the day (the capacity setting). */
  capacity: number;
  label: string | null;
  /** Open work already on the day. Finished work frees its room. */
  committed: number;
  /** Work that can still be added: within capacity, and within the waking day. */
  available: number;
  /** Open self-care on the day (routines, workouts): uses the day, not the work hours. */
  selfCare: number;
  /** Minutes between waking and quiet hours. */
  dayMinutes: number;
  /** Anything (work or self-care) that can still be added before the day is physically full. Today, also capped by the time left. */
  dayAvailable: number;
}

/**
 * Two limits on a day. Work (study, projects, admin, one-offs) is held to the
 * capacity setting: your rule, once it's full nothing more goes on it.
 * Self-care (routines, workouts) doesn't use those hours, but everything
 * together still has to fit between waking and quiet hours.
 */
export function roomOn(
  day: string,
  tasksOnDay: readonly DayTask[],
  setting: CapacitySetting,
  now: Date,
  config: EngineConfig = currentConfig(),
  active: ActiveDay = DEFAULT_ACTIVE_DAY,
): DayRoom {
  const { minutes: capacity, label } = capacityFor(day, setting);
  const open = tasksOnDay.filter((t) => t.status === "pending");
  const committed = open.filter((t) => !t.selfCare).reduce((s, t) => s + minutesOf(t), 0);
  const selfCare = open.filter((t) => t.selfCare).reduce((s, t) => s + minutesOf(t), 0);
  const dayMinutes = Math.max(0, toMinutes(active.endsAt) - toMinutes(active.startsAt));
  let dayAvailable = Math.max(0, dayMinutes - committed - selfCare);
  if (day === dayKey(now, config.timeZone)) {
    const leftToday = Math.floor((zonedInstant(day, active.endsAt, config.timeZone).getTime() - now.getTime()) / 60_000);
    dayAvailable = Math.min(dayAvailable, Math.max(0, leftToday));
  }
  const available = Math.min(Math.max(0, capacity - committed), dayAvailable);
  return { day, capacity, label, committed, available, selfCare, dayMinutes, dayAvailable };
}

export type CapacityCheck =
  | { ok: true; room: DayRoom }
  /** `full`: which limit said no — your work hours, or the waking day itself. */
  | { ok: false; room: DayRoom; adding: number; full: "work" | "day" };

/**
 * Your rule: once a day is full, nothing more goes on it. Room comes back as
 * you finish things (done work stops counting), and capacity itself is a
 * setting you can change — but the check itself has no "add it anyway".
 * Self-care is only held to the waking day.
 */
export function checkCapacity(room: DayRoom, adding: number, selfCare = false): CapacityCheck {
  const limit = selfCare ? room.dayAvailable : room.available;
  if (adding <= limit) return { ok: true, room };
  const full = selfCare || room.dayAvailable < room.capacity - room.committed ? "day" : "work";
  return { ok: false, room, adding, full };
}

export interface Clash {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

/** Open tasks whose time block overlaps [start, start + minutes). */
export function findClashes(
  start: Date,
  minutes: number,
  tasks: readonly DayTask[],
  excludeId: string | null = null,
): Clash[] {
  const end = start.getTime() + minutes * 60_000;
  return tasks
    .filter((t) => t.status === "pending" && t.dueAt !== null && t.id !== excludeId)
    .map((t) => ({ id: t.id, title: t.title, start: t.dueAt!, end: new Date(t.dueAt!.getTime() + minutesOf(t) * 60_000) }))
    .filter((b) => start.getTime() < b.end.getTime() && b.start.getTime() < end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
