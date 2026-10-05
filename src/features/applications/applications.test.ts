import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { APPLICATION_KINDS, deadlineInstant, isValidTimeZone, summarize, targetDay, weightsFor } from "./applications";

const at = (local: string) => new Date(`${local}+01:00`);

describe("deadlines in their own time zone", () => {
  test("New York 23:59 in November (EST, after US clocks change) is 05:59 next day in Lagos", () => {
    expect(deadlineInstant("2026-11-15", "23:59", "America/New_York").toISOString()).toBe("2026-11-16T04:59:00.000Z");
  });
  test("…but in October (still EDT) it's 04:59 — same clock time, different answer", () => {
    expect(deadlineInstant("2026-10-15", "23:59", "America/New_York").toISOString()).toBe("2026-10-16T03:59:00.000Z");
  });
  test("London noon", () => {
    expect(deadlineInstant("2026-12-01", "12:00", "Europe/London").toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });
  test("a misspelt zone is refused, not read as UTC", () => {
    expect(isValidTimeZone("America/New_Yrok")).toBe(false);
    expect(() => deadlineInstant("2026-11-15", "23:59", "America/New_Yrok")).toThrow(RangeError);
  });
});

describe("targetDay", () => {
  test("N days before the deadline's day in Lagos", () => {
    expect(targetDay(deadlineInstant("2026-11-15", "23:59", "America/New_York"), 3)).toBe("2026-11-13"); // deadline is the 16th in Lagos
    expect(targetDay(at("2026-11-15T12:00:00"), 0)).toBe("2026-11-15");
  });
});

describe("summarize", () => {
  const deadlineAt = at("2026-11-16T05:59:00");
  const reqs = [{ title: "Essay", done: false }, { title: "CV", done: true }, { title: "2nd reference", done: false }];

  test("upcoming, with what's missing and progress", () => {
    expect(summarize({ status: "preparing", deadlineAt, targetDaysBefore: 3 }, reqs, at("2026-10-20T10:00:00"))).toEqual({
      urgency: "upcoming",
      daysToTarget: 24,
      daysToDeadline: 27,
      targetDay: "2026-11-13",
      missing: ["Essay", "2nd reference"],
      progress: { done: 1, total: 3 },
    });
  });
  test("within a week of the target: due soon", () => {
    expect(summarize({ status: "preparing", deadlineAt, targetDaysBefore: 3 }, reqs, at("2026-11-06T10:00:00")).urgency).toBe("due_soon");
  });
  test("target passed but deadline not yet: past target (still possible!)", () => {
    const s = summarize({ status: "preparing", deadlineAt, targetDaysBefore: 3 }, reqs, at("2026-11-14T10:00:00"));
    expect(s).toMatchObject({ urgency: "past_target", daysToTarget: -1 });
  });
  test("after the deadline: closed", () => {
    expect(summarize({ status: "preparing", deadlineAt, targetDaysBefore: 3 }, reqs, at("2026-11-16T06:00:00")).urgency).toBe("closed");
  });
  test("no deadline: rolling", () => {
    expect(summarize({ status: "researching", deadlineAt: null, targetDaysBefore: 3 }, [], at("2026-11-01T10:00:00"))).toMatchObject({
      urgency: "rolling",
      daysToTarget: null,
      targetDay: null,
    });
  });
  test("submitted (or later): done, whatever the date", () => {
    expect(summarize({ status: "submitted", deadlineAt, targetDaysBefore: 3 }, reqs, at("2026-11-20T10:00:00")).urgency).toBe("done");
  });
});

test("every kind has a valid pillar split", () => {
  for (const k of APPLICATION_KINDS) expect(() => validateWeights(weightsFor(k))).not.toThrow();
});
