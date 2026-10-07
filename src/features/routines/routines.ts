/**
 * Planning a routine edit, separate from the database: which steps stay, in
 * what order, which are new, and what time each starts. Steps are matched by
 * title, case-insensitively, the way the user would name them.
 */

export interface ExistingStep {
  title: string;
  minutes: number;
}

export interface NewStep {
  title: string;
  minutes?: number;
}

export type PlannedStep = { kind: "keep"; title: string; minutes: number } | { kind: "add"; title: string; minutes: number };

export type RoutinePlan =
  | { ok: true; steps: PlannedStep[]; removed: string[] }
  | { ok: false; reason: "unknown_step"; step: string }
  | { ok: false; reason: "order_mismatch"; missing: string[]; extra: string[] }
  | { ok: false; reason: "duplicate_step"; step: string }
  | { ok: false; reason: "empty" };

const key = (s: string) => s.trim().toLowerCase();
export const DEFAULT_STEP_MINUTES = 10;

export function planRoutineEdit(
  current: readonly ExistingStep[],
  edit: { remove?: readonly string[]; add?: readonly NewStep[]; order?: readonly string[] },
): RoutinePlan {
  const byKey = new Map(current.map((s) => [key(s.title), s]));
  for (const r of edit.remove ?? []) if (!byKey.has(key(r))) return { ok: false, reason: "unknown_step", step: r };
  const removed = new Set((edit.remove ?? []).map(key));

  let steps: PlannedStep[] = current
    .filter((s) => !removed.has(key(s.title)))
    .map((s) => ({ kind: "keep", title: s.title, minutes: s.minutes }));
  for (const a of edit.add ?? []) {
    if (steps.some((s) => key(s.title) === key(a.title))) return { ok: false, reason: "duplicate_step", step: a.title };
    steps.push({ kind: "add", title: a.title.trim(), minutes: a.minutes ?? DEFAULT_STEP_MINUTES });
  }

  if (edit.order) {
    const wanted = edit.order.map(key);
    const have = steps.map((s) => key(s.title));
    const missing = steps.filter((s) => !wanted.includes(key(s.title))).map((s) => s.title);
    const extra = edit.order.filter((o) => !have.includes(key(o)));
    if (missing.length > 0 || extra.length > 0 || new Set(wanted).size !== wanted.length) {
      return { ok: false, reason: "order_mismatch", missing, extra };
    }
    steps = wanted.map((k) => steps.find((s) => key(s.title) === k)!);
  }

  if (steps.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, steps, removed: current.filter((s) => removed.has(key(s.title))).map((s) => s.title) };
}

/** Back-to-back start times from `start` (HH:MM), wrapping past midnight. Null start → any time that day. */
export function stepTimes(start: string | null, minutes: readonly number[]): (string | null)[] {
  if (!start) return minutes.map(() => null);
  let t = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  return minutes.map((m) => {
    const at = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    t += m;
    return at;
  });
}
