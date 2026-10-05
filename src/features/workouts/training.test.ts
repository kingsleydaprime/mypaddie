import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import {
  firstTrainingDay,
  lastPerformance,
  newBests,
  personalBest,
  repsToPrefill,
  summarizeTraining,
  weekdayCode,
  WORKOUT_WEIGHTS,
  workoutBaseXp,
  type HistoryEntry,
  type PerformedEntry,
} from "./training";

const at = (local: string) => new Date(`${local}+01:00`);
const e = (exercise: string, o: Partial<PerformedEntry> = {}): PerformedEntry => ({ exercise, sets: 3, reps: null, weightKg: null, seconds: null, ...o });
const h = (local: string, exercise: string, o: Partial<PerformedEntry> = {}): HistoryEntry => ({ ...e(exercise, o), at: at(local) });

describe("scheduling", () => {
  test("weekday codes", () => {
    expect(weekdayCode("2026-10-05")).toBe("MO");
    expect(weekdayCode("2026-10-11")).toBe("SU");
  });
  test("first training day: today if it's a training day, else the next one", () => {
    expect(firstTrainingDay("2026-10-05", ["MO", "TH"])).toBe("2026-10-05");
    expect(firstTrainingDay("2026-10-06", ["MO", "TH"])).toBe("2026-10-08");
    expect(firstTrainingDay("2026-10-09", ["MO"])).toBe("2026-10-12");
  });
  test("no weekdays is an error, not an infinite loop", () => {
    expect(() => firstTrainingDay("2026-10-05", [])).toThrow(RangeError);
  });
});

describe("XP", () => {
  test("1 per 5 minutes, between 5 and 60", () => {
    expect(workoutBaseXp(60)).toBe(12);
    expect(workoutBaseXp(10)).toBe(5);
    expect(workoutBaseXp(500)).toBe(60);
  });
  test("the pillar split is valid", () => {
    expect(() => validateWeights(WORKOUT_WEIGHTS)).not.toThrow();
  });
});

describe("history", () => {
  const history = [
    h("2026-10-01T18:00:00", "Bench press", { reps: 8, weightKg: 40 }),
    h("2026-10-05T18:00:00", "bench press", { reps: 6, weightKg: 42.5 }),
    h("2026-10-08T18:00:00", "Bench Press", { reps: 10, weightKg: 40 }),
    h("2026-10-05T18:00:00", "Plank", { seconds: 45 }),
    h("2026-10-05T18:00:00", "Dips", { reps: 12 }),
  ];

  test("last performance matches the name case-insensitively", () => {
    expect(lastPerformance("BENCH PRESS", history)).toMatchObject({ reps: 10, weightKg: 40 });
    expect(lastPerformance("Squat", history)).toBeNull();
  });

  test("best = heaviest, regardless of when", () => {
    expect(personalBest("Bench press", history)).toMatchObject({ weightKg: 42.5, reps: 6 });
  });

  describe("new bests", () => {
    test("heavier is a new best", () => {
      expect(newBests([e("Bench press", { reps: 5, weightKg: 45 })], history)).toHaveLength(1);
    });
    test("same weight, more reps is a new best", () => {
      expect(newBests([e("Bench press", { reps: 7, weightKg: 42.5 })], history)[0]!.previous).toMatchObject({ weightKg: 42.5, reps: 6 });
    });
    test("lighter, even for more reps, is not", () => {
      expect(newBests([e("Bench press", { reps: 15, weightKg: 40 })], history)).toEqual([]);
    });
    test("equal is not a new best", () => {
      expect(newBests([e("Bench press", { reps: 6, weightKg: 42.5 })], history)).toEqual([]);
    });
    test("timed holds compare seconds; bodyweight compares reps", () => {
      expect(newBests([e("Plank", { seconds: 60 })], history)).toHaveLength(1);
      expect(newBests([e("Dips", { reps: 13 })], history)).toHaveLength(1);
      expect(newBests([e("Dips", { reps: 11 })], history)).toEqual([]);
    });
    test("a first-ever attempt isn't a new best", () => {
      expect(newBests([e("Squat", { reps: 5, weightKg: 60 })], history)).toEqual([]);
    });
  });
});

describe("summarizeTraining", () => {
  const now = at("2026-10-10T20:00:00");
  const workouts = [
    { at: at("2026-08-20T18:00:00"), entries: [e("Squat", { reps: 5, weightKg: 70 })] },
    { at: at("2026-10-01T18:00:00"), entries: [e("Bench press", { reps: 8, weightKg: 40 })] },
    { at: at("2026-10-08T18:00:00"), entries: [e("Bench press", { reps: 6, weightKg: 45 }), e("Plank", { seconds: 50 })] },
  ];
  test("counts the last 7 and 30 days", () => {
    expect(summarizeTraining(workouts, now)).toMatchObject({ last7: 1, last30: 2, lastWorkout: at("2026-10-08T18:00:00") });
  });
  test("best per exercise, heaviest first", () => {
    expect(summarizeTraining(workouts, now).bests.map((b) => `${b.exercise}:${b.best.weightKg ?? b.best.seconds}`)).toEqual([
      "Squat:70",
      "Bench press:45",
      "Plank:50",
    ]);
  });
  test("nothing logged", () => {
    expect(summarizeTraining([], now)).toEqual({ last7: 0, last30: 0, lastWorkout: null, bests: [] });
  });
});

describe("repsToPrefill", () => {
  test.each([
    ["8", 8],
    ["8-12", 8],
    ["8–12", 8],
    ["AMRAP", null],
    [null, null],
  ] as const)("%p → %p", (target, n) => {
    expect(repsToPrefill(target)).toBe(n);
  });
});
