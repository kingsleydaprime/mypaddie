import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { ACHIEVEMENT_WEIGHTS, ACHIEVEMENTS, longestRun, newlyEarned, type LifeStats } from "./achievements";

const zero: LifeStats = { tasksDone: 0, bestStreak: null, workouts: 0, studyMinutes: 0, saved: 0, bufferFull: false, promisesKeptOnTime: 0, bucketTicks: 0, contacts: 0, reviews: 0, funTimes: 0, topLevel: 1 };

describe("achievements", () => {
  test("keys are unique; weights valid", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
    expect(() => validateWeights(ACHIEVEMENT_WEIGHTS)).not.toThrow();
  });
  test("nothing for a fresh start", () => {
    expect(newlyEarned(zero, new Set())).toEqual([]);
  });
  test("thresholds, and a streak names its habit", () => {
    const got = newlyEarned({ ...zero, tasksDone: 1, bestStreak: { days: 31, habit: "Reading" }, studyMinutes: 600 }, new Set());
    expect(got.map((a) => a.key)).toEqual(["first_task", "streak_7", "streak_30", "study_10h"]);
    expect(got.find((a) => a.key === "streak_30")!.detail).toBe("Reading");
  });
  test("already held isn't earned again", () => {
    expect(newlyEarned({ ...zero, tasksDone: 5 }, new Set(["first_task"]))).toEqual([]);
  });
});

describe("longestRun", () => {
  test("consecutive days, duplicates and gaps", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-03", "2026-10-05"])).toBe(3);
    expect(longestRun(["2026-02-27", "2026-02-28", "2026-03-01"])).toBe(3); // across a month end
  });
});
