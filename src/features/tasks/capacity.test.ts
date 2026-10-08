import { describe, expect, test } from "bun:test";
import { capacityFor, checkCapacity, DEFAULT_CAPACITY, findClashes, roomOn, type CapacitySetting, type DayTask } from "./capacity";

const at = (local: string) => new Date(`${local}+01:00`);
let n = 0;
const task = (overrides: Partial<DayTask>): DayTask => ({
  id: `t${++n}`,
  title: `task ${n}`,
  dueAt: null,
  durationMinutes: null,
  status: "pending",
  ...overrides,
});

describe("capacityFor", () => {
  const setting: CapacitySetting = {
    defaultMinutes: 360,
    periods: [
      { from: "2026-10-10", to: "2026-10-24", minutes: 120, label: "exams" },
      { from: "2026-10-20", to: "2026-10-21", minutes: 0, label: "travel" },
    ],
  };
  test("default outside any period", () => {
    expect(capacityFor("2026-10-09", setting)).toEqual({ minutes: 360, label: null });
  });
  test("a period applies on its dates, both ends inclusive", () => {
    expect(capacityFor("2026-10-10", setting)).toEqual({ minutes: 120, label: "exams" });
    expect(capacityFor("2026-10-24", setting)).toEqual({ minutes: 120, label: "exams" });
    expect(capacityFor("2026-10-25", setting).minutes).toBe(360);
  });
  test("when periods overlap, the later one wins", () => {
    expect(capacityFor("2026-10-20", setting)).toEqual({ minutes: 0, label: "travel" });
  });
});

describe("roomOn", () => {
  const morning = at("2026-10-06T08:00:00");

  test("only open work counts; finished work frees room", () => {
    const room = roomOn("2026-10-07", [
      task({ durationMinutes: 120 }),
      task({ durationMinutes: 90, status: "done" }),
      task({ durationMinutes: 60, status: "cancelled" }),
      task({}), // no duration → 30
    ], DEFAULT_CAPACITY, morning);
    expect(room).toMatchObject({ capacity: 360, committed: 150, available: 210 });
  });

  test("today's room is also capped by the time left before 22:00", () => {
    const room = roomOn("2026-10-06", [], DEFAULT_CAPACITY, at("2026-10-06T20:30:00"));
    expect(room).toMatchObject({ capacity: 360, committed: 0, available: 90 });
  });

  test("after 22:00 there's no room left today", () => {
    expect(roomOn("2026-10-06", [], DEFAULT_CAPACITY, at("2026-10-06T22:30:00")).available).toBe(0);
  });

  test("an over-full day has zero room, never negative", () => {
    expect(roomOn("2026-10-07", [task({ durationMinutes: 500 })], DEFAULT_CAPACITY, morning).available).toBe(0);
  });
});

describe("two limits: work hours and the waking day", () => {
  const morning = at("2026-10-06T08:00:00");

  test("self-care takes day, not work hours", () => {
    const room = roomOn("2026-10-07", [
      task({ durationMinutes: 120, selfCare: true }), // morning routine
      task({ durationMinutes: 60, selfCare: true }), // gym
      task({ durationMinutes: 180 }), // study
    ], DEFAULT_CAPACITY, morning);
    expect(room).toMatchObject({ capacity: 360, committed: 180, selfCare: 180, available: 180 });
  });

  test("the waking day is quiet hours' end to their start: 07:00 → 22:00 is 15h", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 120, selfCare: true }), task({ durationMinutes: 180 })], DEFAULT_CAPACITY, morning);
    expect(room).toMatchObject({ dayMinutes: 900, dayAvailable: 600 });
  });

  test("a custom active day sets the window", () => {
    expect(roomOn("2026-10-07", [], DEFAULT_CAPACITY, morning, undefined, { startsAt: "05:30", endsAt: "23:00" }).dayMinutes).toBe(17 * 60 + 30);
  });

  test("finished self-care frees the day too", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 120, selfCare: true, status: "done" })], DEFAULT_CAPACITY, morning);
    expect(room).toMatchObject({ selfCare: 0, dayAvailable: 900 });
  });

  test("a day packed with self-care leaves less room for work, even with work hours spare", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 800, selfCare: true })], DEFAULT_CAPACITY, morning);
    expect(room).toMatchObject({ committed: 0, dayAvailable: 100, available: 100 });
  });

  test("today, both limits stop at the time left before quiet hours", () => {
    const room = roomOn("2026-10-06", [], DEFAULT_CAPACITY, at("2026-10-06T21:00:00"));
    expect(room).toMatchObject({ available: 60, dayAvailable: 60 });
  });

  test("self-care fits when work hours are full", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 360 })], DEFAULT_CAPACITY, morning);
    expect(checkCapacity(room, 90).ok).toBe(false);
    expect(checkCapacity(room, 90, true).ok).toBe(true);
  });

  test("full work hours are reported as work", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 360 })], DEFAULT_CAPACITY, morning);
    expect(checkCapacity(room, 30)).toMatchObject({ ok: false, full: "work" });
  });

  test("a full day is reported as the day, for work and self-care alike", () => {
    const room = roomOn("2026-10-07", [task({ durationMinutes: 870, selfCare: true })], DEFAULT_CAPACITY, morning);
    expect(checkCapacity(room, 60)).toMatchObject({ ok: false, full: "day" });
    expect(checkCapacity(room, 60, true)).toMatchObject({ ok: false, full: "day" });
    expect(checkCapacity(room, 30, true).ok).toBe(true);
  });
});

describe("checkCapacity", () => {
  const room = roomOn("2026-10-07", [task({ durationMinutes: 300 })], DEFAULT_CAPACITY, at("2026-10-06T08:00:00"));
  test("fits exactly", () => {
    expect(checkCapacity(room, 60).ok).toBe(true);
  });
  test("one minute over is a no", () => {
    expect(checkCapacity(room, 61)).toMatchObject({ ok: false, adding: 61, room: { available: 60 } });
  });
});

describe("findClashes", () => {
  const standup = task({ title: "Standup", dueAt: at("2026-10-07T09:00:00"), durationMinutes: 60 });
  const lunch = task({ title: "Lunch", dueAt: at("2026-10-07T13:00:00") }); // 30 by default

  test("an overlapping block is reported", () => {
    expect(findClashes(at("2026-10-07T09:30:00"), 30, [standup, lunch]).map((c) => c.title)).toEqual(["Standup"]);
  });
  test("back-to-back is not a clash", () => {
    expect(findClashes(at("2026-10-07T10:00:00"), 60, [standup])).toEqual([]);
    expect(findClashes(at("2026-10-07T08:00:00"), 60, [standup])).toEqual([]);
  });
  test("a block that swallows two tasks reports both, in order", () => {
    expect(findClashes(at("2026-10-07T08:30:00"), 300, [lunch, standup]).map((c) => c.title)).toEqual(["Standup", "Lunch"]);
  });
  test("tasks without a duration still occupy 30 minutes", () => {
    expect(findClashes(at("2026-10-07T13:20:00"), 15, [lunch]).map((c) => c.title)).toEqual(["Lunch"]);
  });
  test("done, cancelled and undated tasks don't block anything", () => {
    const done = { ...standup, id: "d", status: "done" as const };
    const cancelled = { ...standup, id: "c", status: "cancelled" as const };
    const undated = task({ durationMinutes: 600 });
    expect(findClashes(at("2026-10-07T09:15:00"), 30, [done, cancelled, undated])).toEqual([]);
  });
  test("editing a task doesn't clash with itself", () => {
    expect(findClashes(at("2026-10-07T09:15:00"), 30, [standup], standup.id)).toEqual([]);
  });
});
