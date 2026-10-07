import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Tier } from "@/shared/domain";
import { dayKey } from "@/shared/time";

export interface TaskForFocus {
  id: string;
  title: string;
  tier: Tier | null;
  isNonNegotiable: boolean;
  dueAt: Date | null;
  status: "pending" | "done" | "skipped" | "cancelled";
}

export interface FocusItem {
  id: string;
  title: string;
  dueAt: Date | null;
  overdue: boolean;
  nonNegotiable: boolean;
}

export interface Focus {
  /** The 3 things that matter right now. Do one. */
  top: FocusItem[];
  /** Everything else still open — one tap away, never pushed. */
  rest: FocusItem[];
  doneToday: number;
}

/**
 * "Here are the 3 things that matter right now." Ranking, highest first:
 *   1. non-negotiables that are overdue      (pray, brush, food…)
 *   2. non-negotiables still to come today
 *   3. other needs, overdue then upcoming
 *   4. everything else, overdue then upcoming
 * Within a group, earliest due first; undated tasks go last in their group.
 * Only today's open tasks and anything overdue are considered.
 */
export function pickFocus(
  tasks: readonly TaskForFocus[],
  now: Date,
  limit = 3,
  config: EngineConfig = currentConfig(),
): Focus {
  const today = dayKey(now, config.timeZone);

  const open = tasks.filter(
    (t) =>
      (t.status === "pending" || t.status === "skipped") &&
      (t.dueAt === null || dayKey(t.dueAt, config.timeZone) <= today),
  );

  const rank = (t: TaskForFocus) => {
    const overdue = t.dueAt !== null && t.dueAt.getTime() < now.getTime();
    const group = t.isNonNegotiable ? 0 : t.tier === "need" ? 1 : 2;
    return group * 2 + (overdue ? 0 : 1);
  };

  const sorted = [...open].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) ||
      a.title.localeCompare(b.title),
  );

  const toItem = (t: TaskForFocus): FocusItem => ({
    id: t.id,
    title: t.title,
    dueAt: t.dueAt,
    overdue: t.dueAt !== null && t.dueAt.getTime() < now.getTime(),
    nonNegotiable: t.isNonNegotiable,
  });

  return {
    top: sorted.slice(0, limit).map(toItem),
    rest: sorted.slice(limit).map(toItem),
    doneToday: tasks.filter((t) => t.status === "done" && t.dueAt !== null && dayKey(t.dueAt, config.timeZone) === today)
      .length,
  };
}
