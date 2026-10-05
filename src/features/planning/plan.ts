import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { dayKey, zonedInstant } from "@/shared/time";

const MIN = 60_000;
/** Breathing room between planned things. */
export const BUFFER_MINUTES = 5;
/** The smallest leftover worth calling free time. */
export const MIN_FREE_MINUTES = 45;
/** Low-XP tasks are chores (the blueprint: low-XP, batched). */
export const CHORE_MAX_XP = 5;

export interface FixedBlock {
  id: string;
  title: string;
  start: Date;
  minutes: number;
  kind: "event" | "task";
}

export interface FlexibleTask {
  id: string;
  title: string;
  minutes: number;
  must: boolean;
  need: boolean;
  chore: boolean;
}

export interface MealSlot {
  name: string;
  at: string;
  minutes: number;
}

export const DEFAULT_MEALS: MealSlot[] = [
  { name: "Breakfast", at: "08:00", minutes: 20 },
  { name: "Lunch", at: "13:00", minutes: 30 },
  { name: "Dinner", at: "19:00", minutes: 40 },
];

export type SlotKind = "event" | "fixed_task" | "meal" | "task" | "chores" | "free";

export interface Slot {
  kind: SlotKind;
  title: string;
  start: Date;
  end: Date;
  /** Task ids placed in this slot (one for a task, several for chores). */
  taskIds: string[];
}

export interface DayPlan {
  day: string;
  slots: Slot[];
  /** What to write back on accept: each flexible task's new start. */
  assignments: { taskId: string; start: Date }[];
  /** Didn't fit — never squeezed in. */
  unplaced: { id: string; title: string; minutes: number }[];
}

interface Span {
  start: number;
  end: number;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** First start ≥ `from` where [start, start+minutes) fits between busy spans and before `end`. */
function firstFit(busy: readonly Span[], from: number, end: number, minutes: number): number | null {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  let cursor = from;
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (cursor + minutes * MIN <= b.start) return cursor;
    cursor = Math.max(cursor, b.end + BUFFER_MINUTES * MIN);
  }
  return cursor + minutes * MIN <= end ? cursor : null;
}

export function planDay(input: {
  day: string;
  now: Date;
  fixed: readonly FixedBlock[];
  flexible: readonly FlexibleTask[];
  meals?: readonly MealSlot[];
  window?: { start: string; end: string };
  config?: EngineConfig;
}): DayPlan {
  const config = input.config ?? DEFAULT_CONFIG;
  const tz = config.timeZone;
  const window = input.window ?? { start: "07:00", end: "22:00" };
  const dayStart = zonedInstant(input.day, window.start, tz).getTime();
  const end = zonedInstant(input.day, window.end, tz).getTime();
  // Planning today starts from now, rounded up to the next 5 minutes.
  const nowMs = Math.ceil(input.now.getTime() / (5 * MIN)) * 5 * MIN;
  const start = input.day === dayKey(input.now, tz) ? Math.max(dayStart, nowMs) : dayStart;

  const slots: Slot[] = [];
  const busy: Span[] = [];
  const add = (slot: Slot) => {
    slots.push(slot);
    busy.push({ start: slot.start.getTime(), end: slot.end.getTime() });
  };

  for (const f of input.fixed) {
    add({
      kind: f.kind === "event" ? "event" : "fixed_task",
      title: f.title,
      start: f.start,
      end: new Date(f.start.getTime() + f.minutes * MIN),
      taskIds: f.kind === "task" ? [f.id] : [],
    });
  }

  // Meals: as close to their usual time as possible, within an hour either way.
  for (const meal of input.meals ?? DEFAULT_MEALS) {
    const ideal = zonedInstant(input.day, meal.at, tz).getTime();
    for (const shift of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
      const s = ideal + shift * MIN;
      const span = { start: s, end: s + meal.minutes * MIN };
      if (s >= start && span.end <= end && !busy.some((b) => overlaps(span, b))) {
        add({ kind: "meal", title: meal.name, start: new Date(s), end: new Date(span.end), taskIds: [] });
        break;
      }
    }
  }

  // Must-dos, then needs, then the rest; chores batched at the end.
  const rank = (t: FlexibleTask) => (t.must ? 0 : t.need ? 1 : 2);
  const ordered = input.flexible.filter((t) => !t.chore).sort((a, b) => rank(a) - rank(b));
  const chores = input.flexible.filter((t) => t.chore);

  const assignments: DayPlan["assignments"] = [];
  const unplaced: DayPlan["unplaced"] = [];
  let lastWork = start;

  for (const t of ordered) {
    const s = firstFit(busy, start, end, t.minutes);
    if (s === null) {
      unplaced.push({ id: t.id, title: t.title, minutes: t.minutes });
      continue;
    }
    add({ kind: "task", title: t.title, start: new Date(s), end: new Date(s + t.minutes * MIN), taskIds: [t.id] });
    assignments.push({ taskId: t.id, start: new Date(s) });
    lastWork = Math.max(lastWork, s + t.minutes * MIN);
  }

  if (chores.length > 0) {
    const total = chores.reduce((m, c) => m + c.minutes, 0);
    const afterWork = lastWork > start ? lastWork + BUFFER_MINUTES * MIN : start;
    const s = firstFit(busy, afterWork, end, total) ?? firstFit(busy, start, end, total);
    if (s === null) {
      unplaced.push(...chores.map((c) => ({ id: c.id, title: c.title, minutes: c.minutes })));
    } else {
      add({ kind: "chores", title: `Chores: ${chores.map((c) => c.title).join(", ")}`, start: new Date(s), end: new Date(s + total * MIN), taskIds: chores.map((c) => c.id) });
      let cursor = s;
      for (const c of chores) {
        assignments.push({ taskId: c.id, start: new Date(cursor) });
        cursor += c.minutes * MIN;
      }
      lastWork = Math.max(lastWork, s + total * MIN);
    }
  }

  // Free time: the biggest gap after the last piece of work. Rest is part of the game.
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  let best: Span | null = null;
  let cursor = lastWork;
  for (const b of [...sorted, { start: end, end }]) {
    if (b.end <= cursor) continue;
    const gap = { start: cursor, end: Math.min(b.start, end) };
    if (gap.end - gap.start >= MIN_FREE_MINUTES * MIN && (!best || gap.end - gap.start > best.end - best.start)) best = gap;
    cursor = Math.max(cursor, b.end);
  }
  if (best) slots.push({ kind: "free", title: "Free time", start: new Date(best.start), end: new Date(best.end), taskIds: [] });

  return {
    day: input.day,
    slots: slots.sort((a, b) => a.start.getTime() - b.start.getTime()),
    assignments,
    unplaced,
  };
}
