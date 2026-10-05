import { describe, expect, test } from "bun:test";
import { learningXp, summarizeSkill, type SessionForSummary } from "./learning";

const at = (local: string) => new Date(`${local}+01:00`);
const now = at("2026-10-10T20:00:00");
const s = (local: string, minutes: number, extra: Partial<SessionForSummary> = {}): SessionForSummary => ({
  topic: null,
  minutes,
  count: null,
  unit: null,
  confidence: null,
  at: at(local),
  ...extra,
});

describe("learningXp", () => {
  test("1 XP per 5 minutes, to the skill's pillar", () => {
    expect(learningXp(45, "skills")).toEqual([{ pillar: "skills", amount: 9, reason: "learning" }]);
    expect(learningXp(60, "academic")[0]!.amount).toBe(12);
  });
  test("never below 1, never above 60", () => {
    expect(learningXp(2, "skills")[0]!.amount).toBe(1);
    expect(learningXp(600, "skills")[0]!.amount).toBe(60);
  });
  test.each([0, -5, 2.5])("rejects %p minutes", (m) => {
    expect(() => learningXp(m, "skills")).toThrow(RangeError);
  });
});

describe("summarizeSkill", () => {
  test("totals over all time, the last 7 and the last 30 days", () => {
    const sum = summarizeSkill([s("2026-08-01T10:00:00", 60), s("2026-09-20T10:00:00", 30), s("2026-10-08T10:00:00", 45)], now);
    expect(sum).toMatchObject({ totalMinutes: 135, last30Minutes: 75, last7Minutes: 45, sessions: 3, lastPractised: "2026-10-08" });
  });

  test("counts add up per unit, ignoring case", () => {
    const sum = summarizeSkill([
      s("2026-10-08T10:00:00", 45, { count: 3, unit: "problems" }),
      s("2026-10-09T10:00:00", 60, { count: 5, unit: "Problems" }),
      s("2026-10-09T18:00:00", 30, { count: 2, unit: "chapters" }),
    ], now);
    expect(sum.counts).toEqual({ problems: 8, chapters: 2 });
  });

  describe("streak", () => {
    test("consecutive days ending today", () => {
      const sum = summarizeSkill([s("2026-10-08T10:00:00", 30), s("2026-10-09T10:00:00", 30), s("2026-10-10T07:00:00", 30)], now);
      expect(sum.streakDays).toBe(3);
    });
    test("still alive if the last session was yesterday", () => {
      expect(summarizeSkill([s("2026-10-08T10:00:00", 30), s("2026-10-09T10:00:00", 30)], now).streakDays).toBe(2);
    });
    test("broken by a missed day", () => {
      expect(summarizeSkill([s("2026-10-07T10:00:00", 30), s("2026-10-10T10:00:00", 30)], now).streakDays).toBe(1);
      expect(summarizeSkill([s("2026-10-07T10:00:00", 30)], now).streakDays).toBe(0);
    });
    test("two sessions on one day count once", () => {
      expect(summarizeSkill([s("2026-10-10T07:00:00", 30), s("2026-10-10T19:00:00", 30)], now).streakDays).toBe(1);
    });
  });

  describe("topics and review", () => {
    const sessions = [
      s("2026-10-05T10:00:00", 40, { topic: "Binary search", confidence: 5 }),
      s("2026-10-08T10:00:00", 45, { topic: "Sliding window", confidence: 2 }),
      s("2026-10-09T10:00:00", 30, { topic: "sliding window " }),
      s("2026-10-09T12:00:00", 20, { topic: "Graphs" }),
      s("2026-10-03T10:00:00", 50, { topic: "Two pointers", confidence: 3 }),
    ];
    const sum = summarizeSkill(sessions, now);

    test("topics group case-insensitively and keep the latest confidence given", () => {
      const sw = sum.topics.find((t) => t.topic.toLowerCase() === "sliding window")!;
      expect(sw).toMatchObject({ sessions: 2, minutes: 75, lastPractised: "2026-10-09", confidence: 2 });
    });

    test("review is due by confidence: shaky soon, solid later", () => {
      const byName = Object.fromEntries(sum.topics.map((t) => [t.topic.toLowerCase(), t]));
      expect(byName["sliding window"]).toMatchObject({ reviewOn: "2026-10-11", reviewDue: false }); // conf 2 → 2 days
      expect(byName["binary search"]).toMatchObject({ reviewOn: "2026-10-19", reviewDue: false }); // conf 5 → 14 days
      expect(byName["two pointers"]).toMatchObject({ reviewOn: "2026-10-07", reviewDue: true }); // conf 3 → 4 days
      expect(byName["graphs"]).toMatchObject({ confidence: null, reviewOn: null, reviewDue: false });
    });

    test("reviewDue lists only due topics, most overdue first", () => {
      const due = summarizeSkill(
        [s("2026-10-01T10:00:00", 30, { topic: "A", confidence: 1 }), s("2026-10-08T10:00:00", 30, { topic: "B", confidence: 1 })],
        now,
      ).reviewDue.map((t) => t.topic);
      expect(due).toEqual(["A", "B"]);
    });
  });

  test("no sessions is an empty summary", () => {
    expect(summarizeSkill([], now)).toMatchObject({ totalMinutes: 0, sessions: 0, lastPractised: null, streakDays: 0, topics: [], reviewDue: [] });
  });
});
