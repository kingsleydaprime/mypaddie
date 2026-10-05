import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import type { PillarWeight } from "./split";
import {
  completionXp,
  dreamMilestoneBonus,
  goalCompletionBonus,
  ignoredNeedDeduction,
  isIgnoredNeed,
  transactionLoggedXp,
  wishFulfilledBonus,
  type TaskForXp,
} from "./xp";

const at = (local: string) => new Date(`${local}+01:00`); // Lagos wall-clock time
const total = (entries: { amount: number }[]) => entries.reduce((s, e) => s + e.amount, 0);

const prayerWeights: PillarWeight[] = [
  { pillar: "spiritual", weight: 70 },
  { pillar: "character", weight: 30 },
];

function task(overrides: Partial<TaskForXp> = {}): TaskForXp {
  return {
    id: "task-1",
    status: "pending",
    tier: "need",
    baseXp: 10,
    dueAt: at("2026-10-05T07:00:00"),
    doneAt: null,
    weights: prayerWeights,
    ...overrides,
  };
}

describe("completionXp", () => {
  test("on time pays full base XP, split by weight", () => {
    const xp = completionXp(task(), at("2026-10-05T06:55:00"));
    expect(xp).toEqual([
      { pillar: "spiritual", amount: 7, reason: "completion" },
      { pillar: "character", amount: 3, reason: "completion" },
    ]);
  });

  test("exactly at the due time is still on time", () => {
    expect(completionXp(task(), at("2026-10-05T07:00:00"))[0]!.reason).toBe("completion");
  });

  test("one second late pays the late share", () => {
    const xp = completionXp(task(), at("2026-10-05T07:00:01"));
    expect(total(xp)).toBe(5);
    expect(xp.every((e) => e.reason === "late_completion")).toBe(true);
  });

  test("days late still earns the same reduced XP — recovering is never worthless", () => {
    expect(total(completionXp(task(), at("2026-10-09T22:00:00")))).toBe(5);
  });

  test("a task with no due time can never be late", () => {
    expect(total(completionXp(task({ dueAt: null }), at("2030-01-01T00:00:00")))).toBe(10);
  });

  test("late XP never rounds down to zero", () => {
    const xp = completionXp(task({ baseXp: 1 }), at("2026-10-06T09:00:00"));
    expect(total(xp)).toBe(1);
  });

  test("late XP rounds half up: 5 base → 3", () => {
    expect(total(completionXp(task({ baseXp: 5 }), at("2026-10-06T09:00:00")))).toBe(3);
  });

  test("every tier earns XP for doing the work", () => {
    for (const tier of ["need", "want", "goal", "wish", "dream", null] as const) {
      expect(total(completionXp(task({ tier }), at("2026-10-05T06:00:00")))).toBe(10);
    }
  });

  test("a custom late multiplier is respected", () => {
    const config = { ...DEFAULT_CONFIG, xp: { ...DEFAULT_CONFIG.xp, lateMultiplier: 0.25 } };
    expect(total(completionXp(task({ baseXp: 20 }), at("2026-10-06T09:00:00"), config))).toBe(5);
  });

  test.each([0, -5, 2.5])("rejects base XP of %p", (baseXp) => {
    expect(() => completionXp(task({ baseXp }), at("2026-10-05T06:00:00"))).toThrow(RangeError);
  });
});

describe("isIgnoredNeed / ignoredNeedDeduction", () => {
  const nextMorning = at("2026-10-06T08:00:00");

  test("an undone need whose due day is over is ignored and deducts half its base XP", () => {
    expect(isIgnoredNeed(task(), [], nextMorning)).toBe(true);
    expect(ignoredNeedDeduction(task(), [], nextMorning)).toEqual([
      { pillar: "spiritual", amount: -4, reason: "ignored_need" },
      { pillar: "character", amount: -1, reason: "ignored_need" },
    ]);
  });

  test("still the same day, even past the due time → not ignored yet (time to recover)", () => {
    expect(isIgnoredNeed(task(), [], at("2026-10-05T23:59:00"))).toBe(false);
  });

  test("the day boundary is Lagos midnight, not UTC midnight", () => {
    // 23:30 UTC on the 5th is 00:30 on the 6th in Lagos → the due day is over.
    expect(isIgnoredNeed(task(), [], new Date("2026-10-05T23:30:00Z"))).toBe(true);
    // 22:30 UTC is 23:30 Lagos → still the due day.
    expect(isIgnoredNeed(task(), [], new Date("2026-10-05T22:30:00Z"))).toBe(false);
  });

  test("a cancelled need was decided on, not ignored", () => {
    expect(isIgnoredNeed(task({ status: "cancelled" }), [], nextMorning)).toBe(false);
  });

  test("a skipped need with no accepted slip is still ignored", () => {
    expect(isIgnoredNeed(task({ status: "skipped" }), [], nextMorning)).toBe(true);
  });

  test("a done need is never ignored, even if done late", () => {
    const done = task({ status: "done", doneAt: at("2026-10-06T07:30:00") });
    expect(isIgnoredNeed(done, [], at("2026-10-07T08:00:00"))).toBe(false);
  });

  test("an accepted slip protects the need from the deduction", () => {
    const slips = [{ taskId: "task-1", accepted: true }];
    expect(ignoredNeedDeduction(task(), slips, nextMorning)).toEqual([]);
  });

  test("a rejected slip (an excuse) does not protect it", () => {
    const slips = [{ taskId: "task-1", accepted: false }];
    expect(total(ignoredNeedDeduction(task(), slips, nextMorning))).toBe(-5);
  });

  test("a slip on a different task does not protect this one", () => {
    const slips = [{ taskId: "task-2", accepted: true }];
    expect(isIgnoredNeed(task(), slips, nextMorning)).toBe(true);
  });

  test.each(["want", "goal", "wish", "dream", null] as const)(
    "a %p task is never deducted for being skipped",
    (tier) => {
      expect(ignoredNeedDeduction(task({ tier }), [], at("2026-12-01T08:00:00"))).toEqual([]);
    },
  );

  test("a need with no due time cannot be ignored", () => {
    expect(isIgnoredNeed(task({ dueAt: null }), [], at("2027-01-01T00:00:00"))).toBe(false);
  });

  test("the deduction is never more than the reward was", () => {
    const reward = total(completionXp(task({ baseXp: 7 }), at("2026-10-05T06:00:00")));
    const penalty = total(ignoredNeedDeduction(task({ baseXp: 7 }), [], nextMorning));
    expect(Math.abs(penalty)).toBeLessThanOrEqual(reward);
    expect(penalty).toBeLessThan(0);
  });
});

describe("bonuses", () => {
  const goalWeights: PillarWeight[] = [
    { pillar: "mental", weight: 60 },
    { pillar: "skills", weight: 40 },
  ];

  test("goal completion pays double the base XP", () => {
    const xp = goalCompletionBonus(50, goalWeights);
    expect(total(xp)).toBe(100);
    expect(xp.every((e) => e.reason === "goal_completion")).toBe(true);
  });

  test("a wish happening pays a flat bonus", () => {
    expect(total(wishFulfilledBonus([{ pillar: "creativity", weight: 100 }]))).toBe(50);
  });

  test("a dream milestone pays triple", () => {
    expect(total(dreamMilestoneBonus(40, goalWeights))).toBe(120);
  });
});

describe("transactionLoggedXp", () => {
  test("logging any transaction pays a little Financial XP", () => {
    expect(transactionLoggedXp()).toEqual([
      { pillar: "financial", amount: 2, reason: "transaction_logged" },
    ]);
  });
});
