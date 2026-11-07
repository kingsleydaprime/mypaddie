import { MILESTONES, type QuitKind, type QuitUnit } from "../quits";

/**
 * What a quit is called on screen: the alias when it has one, so a glance over
 * the shoulder shows "Project P". The real name is in the quit's settings.
 */
export const shownName = (q: { title: string; alias: string | null }) => q.alias ?? q.title;

export const unitLabel = (unit: QuitUnit | null, n: number) =>
  unit === "minutes" ? "min" : n === 1 ? "time" : "times";

export const daysLabel = (kind: QuitKind, n: number) =>
  `${n === 1 ? "day" : "days"} ${kind === "quit" ? "clean" : "under the cap"}`;

/** How far through the gap to the next milestone, 0–1; null after the last. */
export function milestoneProgress(days: number): { next: number; pct: number } | null {
  const next = MILESTONES.find((m) => m.days > days);
  if (!next) return null;
  const prev = [...MILESTONES].reverse().find((m) => m.days <= days)?.days ?? 0;
  return { next: next.days, pct: Math.round(((days - prev) / (next.days - prev)) * 100) };
}

export const milestoneXp = (days: number) => MILESTONES.find((m) => m.days === days)?.xp ?? 0;
