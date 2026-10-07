/**
 * "Where I am right now": a status with an end time that decides what Paddie
 * sends while it lasts. The send job applies the same table in SQL
 * (private.holds); keep the two in step.
 */

export const STATUS_KINDS = ["with_friends", "out", "at_work", "in_class", "deep_work", "sleeping", "worship", "commuting", "resting", "other"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/** all: nothing arrives until it ends. soft: only what's coming up (reminders, heads-ups, events, leave). none: everything. */
export type Hold = "all" | "soft" | "none";

export const STATUS_INFO: Record<StatusKind, { label: string; hold: Hold; leave: boolean }> = {
  with_friends: { label: "With friends", hold: "soft", leave: true },
  out: { label: "Out and about", hold: "soft", leave: true },
  at_work: { label: "At work", hold: "soft", leave: true },
  in_class: { label: "In class", hold: "all", leave: false },
  deep_work: { label: "Deep work", hold: "all", leave: false },
  sleeping: { label: "Sleeping", hold: "all", leave: false },
  worship: { label: "At church / worship", hold: "all", leave: false },
  commuting: { label: "Commuting", hold: "soft", leave: false },
  resting: { label: "Resting", hold: "soft", leave: false },
  other: { label: "Busy", hold: "none", leave: false },
};

/** Push kinds a soft hold still lets through: things that are coming up. */
export const SOFT_ALLOWS = ["reminder", "headsup", "event", "leave"] as const;

export const MAX_STATUS_HOURS = 16;
export const DEFAULT_LEAVE_LEAD = 30;

export type EndCheck = { ok: true } | { ok: false; reason: "in_the_past" | "too_long" };

/** A status must end in the future and within 16 hours: long enough for a night, short enough not to be forgotten on. */
export function checkEnd(endsAt: Date, now: Date): EndCheck {
  if (endsAt.getTime() <= now.getTime()) return { ok: false, reason: "in_the_past" };
  if (endsAt.getTime() - now.getTime() > MAX_STATUS_HOURS * 3_600_000) return { ok: false, reason: "too_long" };
  return { ok: true };
}

export interface StatusRow {
  kind: StatusKind;
  note: string | null;
  startedAt: Date;
  endsAt: Date;
  endedAt: Date | null;
}

export interface ClassBlock {
  title: string;
  start: Date;
  minutes: number;
}

export type Current =
  | { source: "manual"; kind: StatusKind; note: string | null; until: Date }
  | { source: "class"; kind: "in_class"; note: string; until: Date }
  | { source: "phone_free"; kind: "phone_free"; note: null; until: Date }
  | null;

/**
 * What's in force now. A status they set wins over a class (they know better —
 * a cancelled lecture, a free period); a class wins over a phone-free window
 * only in that it's named; both hold everything.
 */
export function currentStatus(rows: readonly StatusRow[], classes: readonly ClassBlock[], phoneFreeUntil: Date | null, now: Date): Current {
  const t = now.getTime();
  const manual = rows
    .filter((r) => r.endedAt === null && r.startedAt.getTime() <= t && r.endsAt.getTime() > t)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  if (manual) return { source: "manual", kind: manual.kind, note: manual.note, until: manual.endsAt };
  const inClass = classes.find((c) => c.start.getTime() <= t && t < c.start.getTime() + c.minutes * 60_000);
  if (inClass) return { source: "class", kind: "in_class", note: inClass.title, until: new Date(inClass.start.getTime() + inClass.minutes * 60_000) };
  if (phoneFreeUntil) return { source: "phone_free", kind: "phone_free", note: null, until: phoneFreeUntil };
  return null;
}

export function holdOf(current: Current): Hold {
  if (!current) return "none";
  if (current.kind === "phone_free") return "all";
  return STATUS_INFO[current.kind].hold;
}

/** Does a push of this kind get through right now? */
export function lets(hold: Hold, pushKind: string): boolean {
  if (hold === "none") return true;
  if (hold === "all") return false;
  return (SOFT_ALLOWS as readonly string[]).includes(pushKind);
}

// ─── Phone-free windows ─────────────────────────────────────────────────────

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

export interface PhoneFree {
  quietStart: string;
  quietEnd: string;
  /** Minutes after quiet hours end (waking up) without the phone; 0 = off. */
  phoneFreeMorning: number;
  /** Minutes before quiet hours start (winding down) without the phone; 0 = off. */
  phoneFreeEvening: number;
}

/** The windows as local "HH:MM" ranges [start, end). */
export function phoneFreeWindows(s: PhoneFree): { start: string; end: string; which: "morning" | "evening" }[] {
  const out: { start: string; end: string; which: "morning" | "evening" }[] = [];
  if (s.phoneFreeMorning > 0) out.push({ start: s.quietEnd, end: toHHMM(toMin(s.quietEnd) + s.phoneFreeMorning), which: "morning" });
  if (s.phoneFreeEvening > 0) out.push({ start: toHHMM(toMin(s.quietStart) - s.phoneFreeEvening), end: s.quietStart, which: "evening" });
  return out;
}

/** Is a local "HH:MM" inside a window? Windows may cross midnight. */
export function inWindow(t: string, w: { start: string; end: string }): boolean {
  return w.start <= w.end ? t >= w.start && t < w.end : t >= w.start || t < w.end;
}

export function phoneFreeAt(t: string, s: PhoneFree) {
  return phoneFreeWindows(s).find((w) => inWindow(t, w)) ?? null;
}

// ─── Leave nudges ───────────────────────────────────────────────────────────

/** Timed things starting within the lead time, while out with a status that wants a "head out" nudge. */
export function leaveDue<T extends { start: Date }>(current: Current, items: readonly T[], now: Date, leadMinutes: number): T[] {
  if (!current || current.source !== "manual" || !STATUS_INFO[current.kind].leave) return [];
  const t = now.getTime();
  return items.filter((i) => i.start.getTime() > t && i.start.getTime() - t <= leadMinutes * 60_000);
}
