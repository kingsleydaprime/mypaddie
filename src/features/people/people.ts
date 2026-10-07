import type { PillarWeight } from "@/features/xp/split";
import { currentConfig, type EngineConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";

export const RELATIONS = ["family", "partner", "friend", "colleague", "classmate", "mentor", "mentee", "boss", "client", "neighbour", "church", "other"] as const;
export type Relation = (typeof RELATIONS)[number];

export const CONTACT_HOW = ["call", "text", "visit", "chat", "video", "other"] as const;
export type ContactHow = (typeof CONTACT_HOW)[number];

/** Reaching out builds the relationship; a call or a visit is worth a bit more than a text. */
export const CONTACT_WEIGHTS: PillarWeight[] = [{ pillar: "relationships", weight: 70 }, { pillar: "social", weight: 30 }];
export const contactXp = (how: ContactHow) => (how === "visit" || how === "call" || how === "video" ? 8 : 5);

export interface PersonLike {
  name: string;
  close: boolean;
  reachOutEveryDays: number | null;
  lastContactAt: Date | null;
  createdAt: Date;
  birthday: string | null;
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Days since you were last in touch (or since you added them, if never). */
export function daysSinceContact(p: PersonLike, now: Date, config: EngineConfig = currentConfig()): number {
  return days(dayKey(p.lastContactAt ?? p.createdAt, config.timeZone), dayKey(now, config.timeZone));
}

/** Due when their rhythm says so; `overdueBy` 0 = due today. Null = not due (or no rhythm). */
export function reachOutDue(p: PersonLike, now: Date, config: EngineConfig = currentConfig()): { overdueBy: number } | null {
  if (p.reachOutEveryDays === null) return null;
  const since = daysSinceContact(p, now, config);
  return since >= p.reachOutEveryDays ? { overdueBy: since - p.reachOutEveryDays } : null;
}

/** Days until their next birthday (0 = today). 29 Feb is celebrated on 28 Feb in other years. */
export function daysToBirthday(birthday: string, now: Date, config: EngineConfig = currentConfig()): number {
  const today = dayKey(now, config.timeZone);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const md = birthday.slice(5);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${md === "02-29" && !leap ? "02-28" : md}`;
  };
  const thisYear = on(year);
  return thisYear >= today ? days(today, thisYear) : days(today, on(year + 1));
}

/** Who to reach out to first: most overdue, close people ahead of others on a tie. */
export function whoToReachOut<T extends PersonLike>(people: readonly T[], now: Date, limit = 3, config: EngineConfig = currentConfig()) {
  return people
    .map((p) => ({ person: p, due: reachOutDue(p, now, config) }))
    .filter((x): x is { person: T; due: { overdueBy: number } } => x.due !== null)
    .sort((a, b) => b.due.overdueBy - a.due.overdueBy || Number(b.person.close) - Number(a.person.close))
    .slice(0, limit);
}
