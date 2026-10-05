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
