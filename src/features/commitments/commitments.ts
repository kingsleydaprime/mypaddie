import { DEFAULT_DURATION } from "@/features/tasks/capacity";
import type { Recurrence } from "@/features/tasks/recurrence";

export const COMMITMENT_KINDS = [
  "full_time", "part_time", "freelance", "internship", "volunteer", "leadership", "membership", "team", "other",
] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

export const KIND_LABEL: Record<CommitmentKind, string> = {
  full_time: "Full-time job",
  part_time: "Part-time job",
  freelance: "Freelance",
  internship: "Internship",
  volunteer: "Volunteering",
  leadership: "Leadership role",
  membership: "Member",
  team: "Team / sport",
  other: "Other",
};

/** core = never suggested for dropping; optional goes first. */
export const COMMITMENT_PRIORITIES = ["core", "important", "optional"] as const;
export type CommitmentPriority = (typeof COMMITMENT_PRIORITIES)[number];

export const COMMITMENT_STATUSES = ["active", "paused", "ended"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

/** Below this share of the week's capacity there's room; up to 100% it's tight; above, overloaded. */
export const TIGHT_AT = 0.8;
export const OVERLOADED_AT = 1;

/** How often a recurring session happens in a week, times its length. */
export function weeklyMinutes(rule: Recurrence, durationMinutes: number | null): number {
  const perWeek = rule.freq === "daily" ? 7 : rule.days.size;
  return perWeek * (durationMinutes ?? DEFAULT_DURATION);
}

export type LoadVerdict = "room" | "tight" | "overloaded";

export function verdictFor(ratio: number): LoadVerdict {
  if (ratio > OVERLOADED_AT) return "overloaded";
  if (ratio >= TIGHT_AT) return "tight";
  return "room";
}

export interface CommitmentLoad {
  id: string;
  title: string;
  priority: CommitmentPriority;
  /** Scheduled sessions per week (from its recurring tasks) plus one-offs this week. */
  scheduledMinutes: number;
  /** His estimate of unscheduled time per week (freelance work, admin, prep). */
  extraMinutes: number;
}

export interface WeekLoad {
  /** Capacity summed over the next 7 days. */
  capacity: number;
  /** Everything already on those 7 days: tasks, habits, events. */
  scheduled: number;
  /** Unscheduled hours from commitments, not on any day yet. */
  extra: number;
  total: number;
  ratio: number;
  verdict: LoadVerdict;
  byCommitment: (CommitmentLoad & { minutes: number })[];
  /** What the rest of the week is: habits, tasks and events not tied to a commitment. */
  other: number;
  /** With the new thing added, if one was given. */
  after?: { adding: number; total: number; ratio: number; verdict: LoadVerdict };
  /** What to drop or pause to get back to "room", when it isn't. */
  dropCandidates: DropCandidate[];
}

export interface DropCandidate {
  id: string;
  title: string;
  priority: CommitmentPriority;
  minutes: number;
  /** Dropping this one and every candidate before it gets the week back under the "tight" line. */
  enough: boolean;
}

/**
 * The week's load against its capacity. `scheduled` comes from the days
 * themselves (so it agrees with the daily capacity check); commitments add
 * their unscheduled estimates. When there's not room — now, or after adding
 * `adding` minutes a week — it lists what to drop: optional before important,
 * the biggest relief first within each; core commitments never.
 */
export function assessLoad(input: {
  capacity: number;
  scheduled: number;
  commitments: readonly CommitmentLoad[];
  adding?: number;
}): WeekLoad {
  const extra = input.commitments.reduce((s, c) => s + c.extraMinutes, 0);
  const total = input.scheduled + extra;
  const ratio = input.capacity > 0 ? total / input.capacity : total > 0 ? Infinity : 0;
  const byCommitment = input.commitments
    .map((c) => ({ ...c, minutes: c.scheduledMinutes + c.extraMinutes }))
    .sort((a, b) => b.minutes - a.minutes);
  const committedToRoles = input.commitments.reduce((s, c) => s + c.scheduledMinutes, 0);

  const after =
    input.adding !== undefined
      ? (() => {
          const t = total + input.adding!;
          const r = input.capacity > 0 ? t / input.capacity : t > 0 ? Infinity : 0;
          return { adding: input.adding!, total: t, ratio: r, verdict: verdictFor(r) };
        })()
      : undefined;

  const target = after?.total ?? total;
  const limit = input.capacity * TIGHT_AT;
  const rank: Record<CommitmentPriority, number> = { optional: 0, important: 1, core: 2 };
  let freed = 0;
  const dropCandidates: DropCandidate[] =
    target < limit
      ? []
      : byCommitment
          .filter((c) => c.priority !== "core" && c.minutes > 0)
          .sort((a, b) => rank[a.priority] - rank[b.priority] || b.minutes - a.minutes)
          .map((c) => {
            freed += c.minutes;
            return { id: c.id, title: c.title, priority: c.priority, minutes: c.minutes, enough: target - freed < limit };
          });

  return {
    capacity: input.capacity,
    scheduled: input.scheduled,
    extra,
    total,
    ratio,
    verdict: verdictFor(ratio),
    byCommitment,
    other: Math.max(0, input.scheduled - committedToRoles),
    ...(after ? { after } : {}),
    dropCandidates,
  };
}
