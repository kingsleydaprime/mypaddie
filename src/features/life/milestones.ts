import { currentConfig, type EngineConfig } from "@/shared/config";
import { dreamMilestoneBonus, type XpEntry } from "@/features/xp/xp";
import type { PillarWeight } from "@/features/xp/split";

/**
 * Milestones (checkpoints under a goal or dream, paying 3× when hit) and
 * moments (big life events, past or planned, no XP). Together: the timeline.
 */

export type MilestoneKind = "milestone" | "moment";
export type MilestoneStatus = "planned" | "achieved" | "dropped";

export interface TimelineEntry {
  id: string;
  kind: MilestoneKind;
  title: string;
  status: MilestoneStatus;
  /** When it happened, or when it's planned for; null = someday. */
  date: string | null;
  item: string | null;
  before: string | null;
  after: string | null;
}

/** Hitting a milestone: 3× the base XP of the goal or dream it sits under (blueprint: dream milestone 3×). */
export function milestoneXp(baseXp: number, weights: readonly PillarWeight[], config: EngineConfig = currentConfig()): XpEntry[] {
  return dreamMilestoneBonus(baseXp, weights, config);
}

export function canAchieve(status: MilestoneStatus): boolean {
  return status === "planned";
}

/**
 * The timeline, oldest first: what's happened (and when), then what's planned
 * (dated, then someday). Dropped ones are left out. Each entry knows the one
 * before and after it, so "what came before" is always there even when they
 * never wrote it down.
 */
export function timeline(entries: readonly TimelineEntry[], today: string) {
  const kept = entries.filter((e) => e.status !== "dropped");
  const happened = kept.filter((e) => e.status === "achieved").sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.title.localeCompare(b.title));
  const ahead = kept
    .filter((e) => e.status === "planned")
    .sort((a, b) => (a.date === null ? 1 : 0) - (b.date === null ? 1 : 0) || (a.date ?? "").localeCompare(b.date ?? "") || a.title.localeCompare(b.title));
  const all = [...happened, ...ahead];
  return all.map((e, i) => ({
    ...e,
    when: e.status === "achieved" ? "past" : e.date !== null && e.date < today ? "overdue" : e.date === null ? "someday" : "ahead",
    previous: all[i - 1]?.title ?? null,
    next: all[i + 1]?.title ?? null,
  }));
}
