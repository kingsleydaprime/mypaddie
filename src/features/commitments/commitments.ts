import { DEFAULT_DURATION } from "@/features/tasks/capacity";
import type { Recurrence } from "@/features/tasks/recurrence";
import { addDays } from "@/shared/time";

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

export interface RoleLike {
  title: string;
  startsOn: string | null;
  endsOn: string | null;
}

export type RoleChange =
  | { kind: "same" }
  /** A correction (typo, or the new role "starts" when the current one did): rename it, no history. */
  | { kind: "rename"; title: string }
  /** A real change: the current role ends the day before, the new one starts on `from`. */
  | { kind: "change"; closeOn: string | null; open: { title: string; startsOn: string } };

/**
 * Member → Secretary. A new title from a date after the current role began is
 * a change, kept as history; the same date (or no current role start to
 * compare with and the same day) is treated as fixing the title.
 */
export function planRoleChange(current: RoleLike | null, next: { title: string; from: string }): RoleChange {
  const title = next.title.trim();
  if (current && current.title.trim().toLowerCase() === title.toLowerCase()) return { kind: "same" };
  if (!current) return { kind: "change", closeOn: null, open: { title, startsOn: next.from } };
  if (current.startsOn !== null && next.from <= current.startsOn) return { kind: "rename", title };
  return { kind: "change", closeOn: addDays(next.from, -1), open: { title, startsOn: next.from } };
}

/** "Member (Sep 2025 – Mar 2026) → Secretary (since Mar 2026)" */
export function roleHistoryText(roles: readonly RoleLike[]): string {
  // A fixed list: Intl's short months differ between runtimes ("Sep" vs "Sept").
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
  return [...roles]
    .sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""))
    .map((r) => {
      const from = r.startsOn ? month(r.startsOn) : null;
      if (r.endsOn) return `${r.title} (${from ? `${from} – ` : "until "}${month(r.endsOn)})`;
      return from ? `${r.title} (since ${from})` : r.title;
    })
    .join(" → ");
}
