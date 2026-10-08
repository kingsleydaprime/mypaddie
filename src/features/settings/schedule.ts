import { z } from "zod";
import { WEEK_STARTS } from "@/features/reviews/periods";
import { phoneFreeAt } from "@/features/status/status";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM, 24-hour");

export const mealSchema = z.object({
  name: z.string().trim().min(1).max(30),
  at: time,
  minutes: z.number().int().min(5).max(120),
});

export const scheduleSchema = z.object({
  /** No nudges between these. May cross midnight (22:00 → 07:00). */
  quietStart: time,
  quietEnd: time,
  briefAt: time,
  /** Evening-before reminders (tasks and events). */
  eveningAt: time,
  /** Morning-of reminders (tasks and events). */
  morningAt: time,
  /** Within this many days an event is "close". */
  eventCloseDays: z.number().int().min(1).max(60),
  meals: z.array(mealSchema).max(6),
  /** Nudge after this many days without fun; 0 = never. */
  funEveryDays: z.number().int().min(0).max(60),
  /** When the fun nudge arrives. */
  funAt: time,
  /** The evening close-out push, if the day isn't closed by then. */
  closeOut: z.boolean(),
  closeAt: time,
  /** A must-do with no set time starts escalating at this time on its day. */
  anyTimeNudgeFrom: time,
  /** Their week: Sunday–Saturday or Monday–Sunday. Weekly reviews, trends and "this week" follow it. */
  weekStart: z.enum(WEEK_STARTS),
  /** No phone for this many minutes after quiet hours end (0 = off). Nothing arrives then. */
  phoneFreeMorning: z.number().int().min(0).max(240),
  /** No phone for this many minutes before quiet hours start (0 = off). */
  phoneFreeEvening: z.number().int().min(0).max(240),
});

export type Schedule = z.infer<typeof scheduleSchema>;
export type Meal = z.infer<typeof mealSchema>;

export const DEFAULT_SCHEDULE: Schedule = {
  quietStart: "22:00",
  quietEnd: "07:00",
  briefAt: "08:00",
  eveningAt: "20:00",
  morningAt: "09:00",
  eventCloseDays: 7,
  meals: [
    { name: "Breakfast", at: "08:00", minutes: 20 },
    { name: "Lunch", at: "13:00", minutes: 30 },
    { name: "Dinner", at: "19:00", minutes: 40 },
  ],
  funEveryDays: 7,
  funAt: "17:00",
  closeOut: true,
  // Before the default quiet hours (22:00), after the evening reminders (20:00).
  closeAt: "21:30",
  // The morning stays free; there's still the afternoon and evening to act.
  anyTimeNudgeFrom: "15:00",
  weekStart: "monday",
  phoneFreeMorning: 0,
  phoneFreeEvening: 0,
};

/** Is a local "HH:MM" inside quiet hours? Handles windows that cross midnight. */
export function isQuiet(t: string, s: Pick<Schedule, "quietStart" | "quietEnd">): boolean {
  return s.quietStart > s.quietEnd ? t >= s.quietStart || t < s.quietEnd : t >= s.quietStart && t < s.quietEnd;
}

/**
 * When the active day ends — for "time left today" and the planner. Quiet
 * hours that start after midnight mean the day runs to the end of the day.
 */
export function dayEndsAt(s: Pick<Schedule, "quietStart">): string {
  return s.quietStart >= "12:00" ? s.quietStart : "23:59";
}

/**
 * The waking day, for capacity: from when quiet hours end to when the day
 * ends. Quiet hours that end in the afternoon or later (a night-shift
 * schedule) mean the day is counted from midnight.
 */
export function activeDay(s: Pick<Schedule, "quietStart" | "quietEnd">): { startsAt: string; endsAt: string } {
  const endsAt = dayEndsAt(s);
  return { startsAt: s.quietEnd < endsAt ? s.quietEnd : "00:00", endsAt };
}

/**
 * Up during their quiet hours? Being active then (talking to Paddie, opening
 * the app) is the sign they're awake when they meant to be asleep. Null
 * outside quiet hours. `sleepLeft` is minutes until quiet hours end.
 */
export function lateNight(s: Pick<Schedule, "quietStart" | "quietEnd">, localTime: string): { at: string; quietSince: string; wakeAt: string; sleepLeft: number } | null {
  if (!isQuiet(localTime, s)) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const sleepLeft = (mins(s.quietEnd) - mins(localTime) + 24 * 60) % (24 * 60);
  return { at: localTime, quietSince: s.quietStart, wakeAt: s.quietEnd, sleepLeft };
}

/** Saved settings merged over the defaults; anything invalid falls back to its default. */
export function readSchedule(saved: unknown): Schedule {
  const merged: Record<string, unknown> = { ...DEFAULT_SCHEDULE };
  if (saved && typeof saved === "object") {
    for (const [k, v] of Object.entries(saved)) {
      const field = scheduleSchema.shape[k as keyof Schedule];
      if (field?.safeParse(v).success) merged[k] = v;
    }
  }
  return scheduleSchema.parse(merged);
}

export type ScheduleChange = Partial<Schedule>;

/**
 * Applies a change and checks the result makes sense as a whole: quiet hours
 * that aren't empty, and reminder times that aren't inside them (a brief at
 * 06:00 with quiet hours until 07:00 would simply never arrive).
 */
export function applyScheduleChange(current: Schedule, change: ScheduleChange): { ok: true; schedule: Schedule } | { ok: false; error: string } {
  const parsed = scheduleSchema.partial().safeParse(change);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid setting" };
  const next = { ...current, ...parsed.data };
  if (next.quietStart === next.quietEnd) return { ok: false, error: "quiet hours can't start and end at the same time" };
  for (const [label, t] of [["morning brief", next.briefAt], ["evening reminder", next.eveningAt], ["morning reminder", next.morningAt], ["fun nudge", next.funAt], ["close-out", next.closeAt], ["any-time must-do nudges", next.anyTimeNudgeFrom]] as const) {
    if (label === "close-out" && !next.closeOut) continue;
    if (isQuiet(t, next)) return { ok: false, error: `the ${label} at ${t} falls inside quiet hours (${next.quietStart}–${next.quietEnd}), so it would never arrive` };
    const free = phoneFreeAt(t, next);
    if (free) return { ok: false, error: `the ${label} at ${t} falls inside your phone-free ${free.which} (${free.start}–${free.end}): move it to ${free.which === "morning" ? free.end : "before " + free.start}, or shorten the window` };
  }
  return { ok: true, schedule: next };
}
