import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { dayKey, zonedInstant } from "@/shared/time";

/** Minutes assumed for a task with no duration — for capacity and for clashes. */
export const DEFAULT_DURATION = 30;
/** Nothing gets scheduled into quiet hours, so today's room ends here. */
const DAY_ENDS_AT = "22:00";

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
}

export function capacityFor(day: string, setting: CapacitySetting): { minutes: number; label: string | null } {
  const period = [...setting.periods].reverse().find((p) => p.from <= day && day <= p.to);
  return period ? { minutes: period.minutes, label: period.label ?? null } : { minutes: setting.defaultMinutes, label: null };
}

const minutesOf = (t: DayTask) => t.durationMinutes ?? DEFAULT_DURATION;

export interface DayRoom {
  day: string;
  capacity: number;
  label: string | null;
  /** Open work already on the day. Finished work frees its room. */
  committed: number;
  /** What can still be added. For today, also capped by the time left before 22:00. */
  available: number;
}

export function roomOn(
  day: string,
  tasksOnDay: readonly DayTask[],
  setting: CapacitySetting,
  now: Date,
  config: EngineConfig = DEFAULT_CONFIG,
): DayRoom {
  const { minutes: capacity, label } = capacityFor(day, setting);
  const committed = tasksOnDay.filter((t) => t.status === "pending").reduce((s, t) => s + minutesOf(t), 0);
  let available = Math.max(0, capacity - committed);
  if (day === dayKey(now, config.timeZone)) {
    const leftToday = Math.floor((zonedInstant(day, DAY_ENDS_AT, config.timeZone).getTime() - now.getTime()) / 60_000);
    available = Math.min(available, Math.max(0, leftToday));
  }
  return { day, capacity, label, committed, available };
}

export type CapacityCheck = { ok: true; room: DayRoom } | { ok: false; room: DayRoom; adding: number };

/**
 * Your rule: once a day is full, nothing more goes on it. Room comes back as
 * you finish things (done work stops counting), and capacity itself is a
 * setting you can change — but the check itself has no "add it anyway".
 */
export function checkCapacity(room: DayRoom, adding: number): CapacityCheck {
  return adding <= room.available ? { ok: true, room } : { ok: false, room, adding };
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
