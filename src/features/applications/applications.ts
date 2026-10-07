import type { PillarWeight } from "@/features/xp/split";
import { currentConfig, type EngineConfig } from "@/shared/config";
import { addDays, dayKey, daysBetween, isValidTimeZone, zonedInstant } from "@/shared/time";

export const APPLICATION_KINDS = ["job", "internship", "scholarship", "fellowship", "grant", "admission", "program", "other"] as const;
export type ApplicationKind = (typeof APPLICATION_KINDS)[number];

export const APPLICATION_STATUSES = ["researching", "preparing", "submitted", "interview", "offer", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Still being worked on: reminders and requirement tasks apply. */
export const isOpen = (s: ApplicationStatus) => s === "researching" || s === "preparing";

export { isValidTimeZone } from "@/shared/time";

/** The exact moment a deadline published as "date time, zone" happens. DST-aware. */
export function deadlineInstant(date: string, time: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`unknown time zone "${timeZone}" — use a name like America/New_York or Europe/London`);
  return zonedInstant(date, time, timeZone);
}

/** The day to aim for: N days before the deadline's local (Lagos) day. */
export function targetDay(deadlineAt: Date, daysBefore: number, config: EngineConfig = currentConfig()): string {
  return addDays(dayKey(deadlineAt, config.timeZone), -daysBefore);
}

/** Requirement tasks become must-dos this long before the target. */
export const MUST_DO_DAYS_BEFORE_TARGET = 2;

/** Who this effort grows: careers vs studies. */
export function weightsFor(kind: ApplicationKind): PillarWeight[] {
  switch (kind) {
    case "job":
    case "internship":
      return [{ pillar: "skills", weight: 50 }, { pillar: "character", weight: 30 }, { pillar: "financial", weight: 20 }];
    case "scholarship":
    case "fellowship":
    case "admission":
      return [{ pillar: "academic", weight: 50 }, { pillar: "character", weight: 30 }, { pillar: "skills", weight: 20 }];
    default:
      return [{ pillar: "skills", weight: 50 }, { pillar: "character", weight: 50 }];
  }
}

export type Urgency = "closed" | "past_target" | "due_soon" | "upcoming" | "rolling" | "done";

export interface ApplicationSummary {
  urgency: Urgency;
  /** Days until the target date (negative once it's passed); null for rolling. */
  daysToTarget: number | null;
  daysToDeadline: number | null;
  targetDay: string | null;
  missing: string[];
  progress: { done: number; total: number };
}

export function summarize(
  app: { status: ApplicationStatus; deadlineAt: Date | null; targetDaysBefore: number },
  requirements: readonly { title: string; done: boolean }[],
  now: Date,
  config: EngineConfig = currentConfig(),
): ApplicationSummary {
  const tz = config.timeZone;
  const missing = requirements.filter((r) => !r.done).map((r) => r.title);
  const progress = { done: requirements.length - missing.length, total: requirements.length };
  const target = app.deadlineAt ? targetDay(app.deadlineAt, app.targetDaysBefore, config) : null;
  // Both are calendar dates: just the day difference between today (his time) and the target.
  const today = dayKey(now, tz);
  const daysToTarget = target ? Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  const daysToDeadline = app.deadlineAt ? daysBetween(now, app.deadlineAt, tz) : null;

  let urgency: Urgency;
  if (!isOpen(app.status)) urgency = "done";
  else if (app.deadlineAt === null) urgency = "rolling";
  else if (app.deadlineAt.getTime() <= now.getTime()) urgency = "closed";
  else if (target! < today) urgency = "past_target";
  else if (daysToTarget! <= 7) urgency = "due_soon";
  else urgency = "upcoming";

  return { urgency, daysToTarget, daysToDeadline, targetDay: target, missing, progress };
}
