import type { XpEntry } from "@/features/xp/xp";

/**
 * The evening close-out: sweep what's unfinished, decide each one, note a win,
 * and see tomorrow. Pure rules here; the repo loads and applies them.
 */

export interface OpenTask {
  id: string;
  title: string;
  /** Local day it was due ("YYYY-MM-DD"), or null for undated. */
  day: string | null;
  isNeed: boolean;
  isHabit: boolean;
  status: "pending" | "skipped";
}

export type Decision =
  | { kind: "move"; to: string }
  | { kind: "drop" }
  | { kind: "slipped"; why: string; category: string };

export type DecisionKind = Decision["kind"];

/**
 * What's on the table tonight: anything still pending that was due today or
 * earlier. Undated tasks aren't "unfinished" — they had no day. A habit's
 * missed day can't be moved (tomorrow has its own row), and a need can't
 * simply be dropped — skipping a need is a slip, with its reason judged.
 */
export function sweep(tasks: readonly OpenTask[], today: string) {
  return tasks
    .filter((t) => t.status === "pending" && t.day !== null && t.day <= today)
    .sort((a, b) => (a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : a.title.localeCompare(b.title)))
    .map((t) => ({ ...t, overdueDays: daysBetween(t.day!, today), options: optionsFor(t) }));
}

export function optionsFor(t: Pick<OpenTask, "isNeed" | "isHabit">): DecisionKind[] {
  if (t.isHabit) return ["slipped"];
  return t.isNeed ? ["move", "slipped"] : ["move", "drop", "slipped"];
}

export type DecisionCheck = { ok: true } | { ok: false; reason: "not_allowed" | "move_to_past" | "empty_reason" };

export function checkDecision(t: Pick<OpenTask, "isNeed" | "isHabit">, d: Decision, today: string): DecisionCheck {
  if (!optionsFor(t).includes(d.kind)) return { ok: false, reason: "not_allowed" };
  if (d.kind === "move" && d.to <= today) return { ok: false, reason: "move_to_past" };
  if (d.kind === "slipped" && (d.why.trim() === "" || d.category.trim() === "")) return { ok: false, reason: "empty_reason" };
  return { ok: true };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Closing the day is the habit being rewarded, not how the day went: same small XP either way, once a day. */
export const CLOSE_OUT_XP = 5;
export function closeOutXp(): XpEntry[] {
  return [
    { pillar: "character", amount: 3, reason: "day_closed" },
    { pillar: "mental", amount: 2, reason: "day_closed" },
  ];
}

/**
 * A one-line read of the day for the AI to open with: done vs open, and
 * whether the same thing has been carried over for days (a sign to shrink or
 * drop it rather than move it again).
 */
export function dayRead(done: number, open: readonly { title: string; overdueDays: number }[]) {
  const carried = open.filter((t) => t.overdueDays >= 3).map((t) => t.title);
  const total = done + open.length;
  return {
    done,
    open: open.length,
    share: total === 0 ? null : Math.round((done / total) * 100),
    carriedOver: carried,
    hint:
      carried.length > 0
        ? "Some of these have been moved for 3+ days: shrink them to a first step, or drop them."
        : open.length === 0
          ? "Nothing left open. Ask for one win, then set up tomorrow."
          : "Decide each one: move it, drop it, or say why it slipped.",
  };
}

/**
 * Reasons offered in the app, where no AI is there to judge. Real reasons
 * protect a need from the ignored-need deduction; the rest are honest, and
 * honest is good, but they don't. (In chat, the AI judges the words instead.)
 */
export const SLIP_REASONS = [
  { category: "sick", label: "Sick", accepted: true },
  { category: "emergency", label: "Emergency", accepted: true },
  { category: "no power or data", label: "No power or data", accepted: true },
  { category: "plans changed", label: "Plans changed (not by me)", accepted: true },
  { category: "tired", label: "Too tired", accepted: false },
  { category: "no time", label: "Ran out of time", accepted: false },
  { category: "forgot", label: "Forgot", accepted: false },
  { category: "didn't feel like it", label: "Didn't feel like it", accepted: false },
] as const;

export function reasonAccepted(category: string): boolean {
  return SLIP_REASONS.find((r) => r.category === category.trim().toLowerCase())?.accepted ?? false;
}
