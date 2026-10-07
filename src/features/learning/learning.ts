import type { XpEntry } from "@/features/xp/xp";
import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Pillar } from "@/shared/domain";
import { addDays, dayKey, withinLastDays } from "@/shared/time";

/** 1 XP per 5 minutes of focused learning, at least 1, at most 60 (5 hours) a session. */
export function learningXp(minutes: number, pillar: Pillar): XpEntry[] {
  if (!Number.isInteger(minutes) || minutes < 1) throw new RangeError(`minutes must be a positive whole number, got ${minutes}`);
  return [{ pillar, amount: Math.min(60, Math.max(1, Math.round(minutes / 5))), reason: "learning" }];
}

/**
 * Spaced repetition by confidence: how many days after practising a topic it's
 * due again. Shaky topics come back tomorrow; solid ones in two weeks.
 */
export const REVIEW_AFTER_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

export interface SessionForSummary {
  topic: string | null;
  minutes: number;
  count: number | null;
  unit: string | null;
  confidence: number | null;
  at: Date;
}

export interface TopicSummary {
  topic: string;
  sessions: number;
  minutes: number;
  lastPractised: string;
  /** Latest confidence given for this topic, if any. */
  confidence: number | null;
  /** When it's next due for review; null when no confidence was ever given. */
  reviewOn: string | null;
  reviewDue: boolean;
}

export interface SkillSummary {
  totalMinutes: number;
  last7Minutes: number;
  last30Minutes: number;
  sessions: number;
  lastPractised: string | null;
  /** Consecutive days with a session, ending today or yesterday. */
  streakDays: number;
  /** Totals per unit: { problems: 23, chapters: 4 }. */
  counts: Record<string, number>;
  topics: TopicSummary[];
  /** Topics due for review, most overdue first. */
  reviewDue: TopicSummary[];
}

export function summarizeSkill(
  sessions: readonly SessionForSummary[],
  now: Date,
  config: EngineConfig = currentConfig(),
): SkillSummary {
  const tz = config.timeZone;
  const today = dayKey(now, tz);
  const sorted = [...sessions].sort((a, b) => a.at.getTime() - b.at.getTime());

  const sum = (xs: readonly SessionForSummary[]) => xs.reduce((s, x) => s + x.minutes, 0);
  const counts: Record<string, number> = {};
  for (const s of sorted) {
    if (s.unit && s.count !== null) {
      const unit = s.unit.trim().toLowerCase();
      counts[unit] = (counts[unit] ?? 0) + s.count;
    }
  }

  // Streak: walk back from today (or yesterday, if nothing yet today).
  const days = new Set(sorted.map((s) => dayKey(s.at, tz)));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  while (days.has(cursor)) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  // Topics, grouped case-insensitively; the latest spelling is shown.
  const byTopic = new Map<string, SessionForSummary[]>();
  for (const s of sorted) {
    if (!s.topic?.trim()) continue;
    const key = s.topic.trim().toLowerCase();
    byTopic.set(key, [...(byTopic.get(key) ?? []), s]);
  }
  const topics: TopicSummary[] = [...byTopic.values()].map((group) => {
    const last = group[group.length - 1]!;
    const lastPractised = dayKey(last.at, tz);
    const confidence = [...group].reverse().find((s) => s.confidence !== null)?.confidence ?? null;
    const reviewOn = confidence === null ? null : addDays(lastPractised, REVIEW_AFTER_DAYS[confidence] ?? 7);
    return {
      topic: last.topic!.trim(),
      sessions: group.length,
      minutes: sum(group),
      lastPractised,
      confidence,
      reviewOn,
      reviewDue: reviewOn !== null && reviewOn <= today,
    };
  });

  return {
    totalMinutes: sum(sorted),
    last7Minutes: sum(sorted.filter((s) => withinLastDays(s.at, now, 7, tz))),
    last30Minutes: sum(sorted.filter((s) => withinLastDays(s.at, now, 30, tz))),
    sessions: sorted.length,
    lastPractised: sorted.length ? dayKey(sorted[sorted.length - 1]!.at, tz) : null,
    streakDays,
    counts,
    topics: topics.sort((a, b) => (a.lastPractised < b.lastPractised ? 1 : -1)),
    reviewDue: topics
      .filter((t) => t.reviewDue)
      // "YYYY-MM-DD" sorts correctly as text: earliest due date = most overdue.
      .sort((a, b) => a.reviewOn!.localeCompare(b.reviewOn!)),
  };
}
