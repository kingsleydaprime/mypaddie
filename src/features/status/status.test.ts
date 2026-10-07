import { describe, expect, test } from "bun:test";
import { checkEnd, currentStatus, holdOf, inWindow, leaveDue, lets, phoneFreeAt, phoneFreeWindows, STATUS_INFO, STATUS_KINDS } from "./status";

const at = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00+01:00`);
const now = at("18:00");
const row = (kind: (typeof STATUS_KINDS)[number], start: string, end: string, endedAt: Date | null = null) => ({ kind, note: null, startedAt: at(start), endsAt: at(end), endedAt });

describe("checkEnd", () => {
  test("in the future, within 16 hours", () => {
    expect(checkEnd(at("20:00"), now)).toEqual({ ok: true });
    expect(checkEnd(at("17:59"), now)).toEqual({ ok: false, reason: "in_the_past" });
    expect(checkEnd(new Date(now.getTime() + 17 * 3_600_000), now)).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("currentStatus", () => {
  const lecture = { title: "CSC 201 Lecture", start: at("17:00"), minutes: 120 };
  test("nothing set, no class, no window: nothing", () => {
    expect(currentStatus([], [], null, now)).toBeNull();
  });
  test("a status they set, until its end", () => {
    expect(currentStatus([row("with_friends", "17:00", "20:00")], [], null, now)).toMatchObject({ source: "manual", kind: "with_friends" });
    expect(currentStatus([row("with_friends", "17:00", "18:00")], [], null, now)).toBeNull();
  });
  test("cleared early: gone", () => {
    expect(currentStatus([row("deep_work", "17:00", "20:00", at("17:30"))], [], null, now)).toBeNull();
  });
  test("the newest of overlapping statuses wins", () => {
    expect(currentStatus([row("at_work", "09:00", "21:00"), row("with_friends", "17:30", "20:00")], [], null, now)?.kind).toBe("with_friends");
  });
  test("a class running now puts them in class, until it ends", () => {
    expect(currentStatus([], [lecture], null, now)).toEqual({ source: "class", kind: "in_class", note: "CSC 201 Lecture", until: at("19:00") });
  });
  test("but a status they set wins over the timetable (a cancelled lecture)", () => {
    expect(currentStatus([row("with_friends", "17:30", "20:00")], [lecture], null, now)?.kind).toBe("with_friends");
  });
  test("a phone-free window when nothing else applies", () => {
    expect(currentStatus([], [], at("22:00"), now)).toMatchObject({ source: "phone_free", until: at("22:00") });
  });
});

describe("holds", () => {
  test("sleeping, class, worship, deep work and phone-free hold everything", () => {
    for (const k of ["sleeping", "in_class", "worship", "deep_work"] as const) expect(STATUS_INFO[k].hold).toBe("all");
    expect(holdOf({ source: "phone_free", kind: "phone_free", note: null, until: now })).toBe("all");
    expect(lets("all", "reminder")).toBe(false);
  });
  test("a soft hold lets only what's coming up through", () => {
    expect(lets("soft", "reminder")).toBe(true);
    expect(lets("soft", "leave")).toBe(true);
    expect(lets("soft", "nudge")).toBe(false);
    expect(lets("soft", "fun")).toBe(false);
    expect(lets("soft", "close_out")).toBe(false);
  });
  test("no status: everything", () => {
    expect(holdOf(null)).toBe("none");
    expect(lets("none", "nudge")).toBe(true);
  });
  test("every kind has a label and a hold", () => {
    for (const k of STATUS_KINDS) expect(STATUS_INFO[k].label.length).toBeGreaterThan(0);
  });
});

describe("phone-free windows", () => {
  const s = { quietStart: "22:00", quietEnd: "07:00", phoneFreeMorning: 120, phoneFreeEvening: 60 };
  test("first two hours after waking, last hour before quiet", () => {
    expect(phoneFreeWindows(s)).toEqual([
      { start: "07:00", end: "09:00", which: "morning" },
      { start: "21:00", end: "22:00", which: "evening" },
    ]);
  });
  test("off when zero", () => {
    expect(phoneFreeWindows({ ...s, phoneFreeMorning: 0, phoneFreeEvening: 0 })).toEqual([]);
  });
  test("inside and outside", () => {
    expect(phoneFreeAt("08:59", s)?.which).toBe("morning");
    expect(phoneFreeAt("09:00", s)).toBeNull();
    expect(phoneFreeAt("21:15", s)?.which).toBe("evening");
  });
  test("a window that crosses midnight", () => {
    const late = { quietStart: "00:30", quietEnd: "08:00", phoneFreeMorning: 0, phoneFreeEvening: 60 };
    expect(phoneFreeWindows(late)).toEqual([{ start: "23:30", end: "00:30", which: "evening" }]);
    expect(inWindow("00:10", { start: "23:30", end: "00:30" })).toBe(true);
    expect(inWindow("01:00", { start: "23:30", end: "00:30" })).toBe(false);
  });
});

describe("leaveDue", () => {
  const items = [{ title: "Standup", start: at("18:20") }, { title: "Dinner", start: at("19:00") }, { title: "Past", start: at("17:50") }];
  const friends = { source: "manual" as const, kind: "with_friends" as const, note: null, until: at("21:00") };
  test("with friends: what starts within the lead time", () => {
    expect(leaveDue(friends, items, now, 30).map((i) => i.title)).toEqual(["Standup"]);
    expect(leaveDue(friends, items, now, 60).map((i) => i.title)).toEqual(["Standup", "Dinner"]);
  });
  test("statuses without leave nudges, or none at all: nothing", () => {
    expect(leaveDue({ ...friends, kind: "deep_work" }, items, now, 60)).toEqual([]);
    expect(leaveDue(null, items, now, 60)).toEqual([]);
  });
});
