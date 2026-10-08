import { currentConfig, type EngineConfig } from "@/shared/config";
import type { Priority, Tier } from "@/shared/domain";
import { dayKey } from "@/shared/time";

export interface TaskForFocus {
  id: string;
  title: string;
  tier: Tier | null;
  isNonNegotiable: boolean;
  dueAt: Date | null;
  status: "pending" | "done" | "skipped" | "cancelled";
  /** A step of a routine: shown with its routine as one item. */
  routine?: { id: string; title: string; step: number } | null;
  /** Started and not finished: in progress. */
  startedAt?: Date | null;
  /** Time put in before the current stretch: a paused task has some and no startedAt. */
  spentMinutes?: number;
  /** Ticked steps of its checklist. */
  steps?: { done: number; total: number } | null;
  /** The commitment or course it's for. */
  forLabel?: string | null;
  /** An any-time task's day is over at this moment (quiet hours start): overdue after it. */
  anyTimeEndsAt?: Date | null;
  /** Among its neighbours; missing = normal. */
  priority?: Priority;
}

export interface FocusItem {
  /** The task to complete — for a routine, its next step. */
  id: string;
  title: string;
  dueAt: Date | null;
  overdue: boolean;
  nonNegotiable: boolean;
  routine?: { title: string; next: string; done: number; total: number };
  startedAt: Date | null;
  spentMinutes: number;
  steps: { done: number; total: number } | null;
  forLabel: string | null;
  priority: Priority;
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/** A task with a set time further off than this waits below what can be done now (an evening routine at 08:00). Their setting; this is the default. */
export const SOON_MINUTES = 60;

export interface Focus {
  /** The 3 things that matter right now. Do one. */
  top: FocusItem[];
  /** Everything else still open — one tap away, never pushed. */
  rest: FocusItem[];
  doneToday: number;
}

/**
 * "Here are the 3 things that matter right now." Ranking, highest first:
 *   0. whatever they've started (in progress)
 *   1. non-negotiables that are overdue      (pray, brush, food…)
 *   2. non-negotiables still to come today
 *   3. other needs, overdue then upcoming
 *   4. everything else, overdue then upcoming
 * …except that anything with a set time more than `soonMinutes` away (their
 * "show timed tasks from" setting, an hour by default) is "later":
 * it waits below all of that (in the same order among itself) until it's
 * close — unless it's started, or it's a routine they've already begun.
 * Within a group, priority first (high, normal, low), then overdue before
 * upcoming, then earliest due; undated tasks go last among their equals. So a
 * must-do still outranks a high-priority ordinary task.
 * Only today's open tasks and anything overdue are considered.
 */
export function pickFocus(
  tasks: readonly TaskForFocus[],
  now: Date,
  limit = 3,
  config: EngineConfig = currentConfig(),
  soonMinutes: number = SOON_MINUTES,
): Focus {
  const today = dayKey(now, config.timeZone);

  const open = tasks.filter(
    (t) =>
      (t.status === "pending" || t.status === "skipped") &&
      (t.dueAt === null || dayKey(t.dueAt, config.timeZone) <= today),
  );

  // Any time means before quiet hours start; anything else is overdue once its due time passes.
  const isOverdue = (t: TaskForFocus) => {
    const deadline = t.anyTimeEndsAt ?? t.dueAt;
    return deadline !== null && deadline.getTime() < now.getTime();
  };

  // Routines with a step already done today are under way: they stay up, whatever the next step's time.
  const begun = new Set(
    tasks.filter((t) => t.routine && t.status === "done" && t.dueAt !== null && dayKey(t.dueAt, config.timeZone) === today).map((t) => t.routine!.id),
  );
  const isLater = (t: TaskForFocus) =>
    !t.startedAt &&
    !t.anyTimeEndsAt &&
    t.dueAt !== null &&
    t.dueAt.getTime() - now.getTime() > soonMinutes * 60_000 &&
    !(t.routine && begun.has(t.routine.id));

  const rank = (t: TaskForFocus) => {
    // Whatever they've started comes first: it's what they're doing.
    if (t.startedAt) return -1;
    const group = t.isNonNegotiable ? 0 : t.tier === "need" ? 1 : 2;
    const priority = PRIORITY_ORDER[t.priority ?? "normal"];
    return (isLater(t) ? 100 : 0) + group * 6 + priority * 2 + (isOverdue(t) ? 0 : 1);
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
    overdue: isOverdue(t),
    nonNegotiable: t.isNonNegotiable,
    startedAt: t.startedAt ?? null,
    spentMinutes: t.spentMinutes ?? 0,
    steps: t.steps ?? null,
    forLabel: t.forLabel ?? null,
    priority: t.priority ?? "normal",
  });

  // A routine takes one place: its open steps collapse into a single item at
  // the rank of its most urgent step, completing the next step in order.
  const items: FocusItem[] = [];
  const seenRoutine = new Set<string>();
  for (const t of sorted) {
    if (!t.routine) {
      items.push(toItem(t));
      continue;
    }
    if (seenRoutine.has(t.routine.id)) continue;
    seenRoutine.add(t.routine.id);
    const rid = t.routine.id;
    const isToday = (x: TaskForFocus) => x.routine?.id === rid && (x.dueAt === null || dayKey(x.dueAt, config.timeZone) === today);
    const steps = tasks.filter(isToday).sort((a, b) => a.routine!.step - b.routine!.step);
    const next = open.filter((x) => x.routine?.id === rid).sort((a, b) => a.routine!.step - b.routine!.step)[0]!;
    items.push({
      ...toItem(t),
      id: next.id,
      title: t.routine.title,
      routine: { title: t.routine.title, next: next.title, done: steps.filter((x) => x.status === "done").length, total: steps.length },
    });
  }

  return {
    top: items.slice(0, limit),
    rest: items.slice(limit),
    doneToday: tasks.filter((t) => t.status === "done" && t.dueAt !== null && dayKey(t.dueAt, config.timeZone) === today)
      .length,
  };
}
