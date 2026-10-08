/**
 * Doing a task, separate from the database: its checklist (the steps inside
 * one task, ticked off as you go) and how long it took once started. XP stays
 * on the task as a whole; steps are for you, not for points.
 */

export interface Step {
  text: string;
  done: boolean;
}

/** The database's limit (tasks.checklist). */
export const MAX_STEPS = 30;
const MAX_STEP_LENGTH = 200;

const key = (s: string) => s.trim().toLowerCase();

/** Whatever is stored, as steps; anything malformed is dropped rather than trusted. */
export function readChecklist(stored: unknown): Step[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((s) =>
    s && typeof s === "object" && typeof (s as Step).text === "string" && (s as Step).text.trim()
      ? [{ text: (s as Step).text.trim(), done: (s as Step).done === true }]
      : [],
  );
}

export type ChecklistPlan = { ok: true; steps: Step[] | null } | { ok: false; reason: "too_many" | "too_long" | "duplicate"; step?: string };

/**
 * New wording for the list, in order. A step that's still there (same words,
 * any case) keeps its tick; blank lines are ignored; an empty list clears it.
 */
export function planChecklist(current: readonly Step[], texts: readonly string[]): ChecklistPlan {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length > MAX_STEPS) return { ok: false, reason: "too_many" };
  const long = clean.find((t) => t.length > MAX_STEP_LENGTH);
  if (long) return { ok: false, reason: "too_long", step: long };
  const seen = new Set<string>();
  for (const t of clean) {
    if (seen.has(key(t))) return { ok: false, reason: "duplicate", step: t };
    seen.add(key(t));
  }
  if (clean.length === 0) return { ok: true, steps: null };
  const was = new Map(current.map((s) => [key(s.text), s.done]));
  return { ok: true, steps: clean.map((text) => ({ text, done: was.get(key(text)) ?? false })) };
}

export type TickResult = { ok: true; steps: Step[]; allDone: boolean } | { ok: false; reason: "no_checklist" | "unknown_step"; step: string };

/** Tick (or untick) one step, by its number from 1 or by its words. */
export function tickStep(steps: readonly Step[], ref: number | string, done = true): TickResult {
  if (steps.length === 0) return { ok: false, reason: "no_checklist", step: String(ref) };
  const i = typeof ref === "number" ? ref - 1 : steps.findIndex((s) => key(s.text) === key(ref));
  if (i < 0 || i >= steps.length) return { ok: false, reason: "unknown_step", step: String(ref) };
  const next = steps.map((s, j) => (j === i ? { ...s, done } : s));
  return { ok: true, steps: next, allDone: next.every((s) => s.done) };
}

/** "2 of 5 steps", or null for a task without a checklist. */
export function stepsDone(steps: readonly Step[]): { done: number; total: number } | null {
  return steps.length ? { done: steps.filter((s) => s.done).length, total: steps.length } : null;
}

/** Longer than this and the start was forgotten, not the work: don't trust it as a measure. */
const LONGEST_SITTING_MINUTES = 12 * 60;

/** Whole minutes since it was started (at least 1), and whether that's believable as time spent. */
export function timeSpent(startedAt: Date, now: Date): { minutes: number; believable: boolean } {
  const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
  return { minutes, believable: minutes <= LONGEST_SITTING_MINUTES };
}

/**
 * All the time put into a task so far: earlier stretches (paused) plus the
 * current one if it's running. A current stretch left running for half a day
 * is left out as forgotten. Null if nothing's been timed.
 */
export function totalTime(spentMinutes: number, startedAt: Date | null, now: Date): number | null {
  const current = startedAt ? timeSpent(startedAt, now) : null;
  const total = spentMinutes + (current?.believable ? current.minutes : 0);
  return total > 0 ? total : null;
}
