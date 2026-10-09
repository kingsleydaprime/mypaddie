import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import type { PillarWeight } from "./split";
import {
  completionXp,
  dreamMilestoneBonus,
  goalCompletionBonus,
  ignoredNeedDeduction,
  isIgnoredNeed,
  anyTimeEndsAt,
  lateAfter,
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

  describe("non-negotiable habit days (routine steps)", () => {
    // A routine step: no item, so no tier — the must-do flag is what counts.
    const step = (o: Partial<TaskForXp> = {}) =>
      task({ tier: null, baseXp: 5, isNonNegotiable: true, occursOn: "2026-10-10", dueAt: at("2026-10-10T21:00:00"), ...o });

    test("an unticked step loses half its XP once its day is over", () => {
      expect(isIgnoredNeed(step(), [], at("2026-10-10T23:59:00"))).toBe(false);
      expect(total(ignoredNeedDeduction(step(), [], at("2026-10-11T00:01:00")))).toBe(-3);
    });

    test("a ticked step keeps what it earned", () => {
      expect(isIgnoredNeed(step({ status: "done", doneAt: at("2026-10-10T21:05:00") }), [], at("2026-10-11T08:00:00"))).toBe(false);
    });

    test("an any-time step is judged by its day", () => {
      expect(isIgnoredNeed(step({ dueAt: null }), [], at("2026-10-10T23:00:00"))).toBe(false);
      expect(isIgnoredNeed(step({ dueAt: null }), [], at("2026-10-11T00:01:00"))).toBe(true);
    });

    test("an accepted slip excuses it", () => {
      expect(isIgnoredNeed(step(), [{ taskId: "task-1", accepted: true }], at("2026-10-11T08:00:00"))).toBe(false);
    });

    test("an ordinary habit (not a must-do) still never deducts", () => {
      expect(isIgnoredNeed(step({ isNonNegotiable: false }), [], at("2026-10-11T08:00:00"))).toBe(false);
    });

    test("a one-off must-do isn't a habit day: it can be moved, so it doesn't deduct", () => {
      expect(isIgnoredNeed(step({ occursOn: null }), [], at("2026-10-11T08:00:00"))).toBe(false);
    });

    test("days before the rule started don't deduct", () => {
      const old = step({ occursOn: "2026-10-08", dueAt: at("2026-10-08T21:00:00") });
      expect(isIgnoredNeed(old, [], at("2026-10-11T08:00:00"))).toBe(false);
    });
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

describe("lateAfter", () => {
  test("a deadline is late right after its due time", () => {
    expect(lateAfter(at("2026-10-05T14:00:00"), null)).toEqual(at("2026-10-05T14:00:00"));
  });
  test("a time block (has a duration) is on time until its day ends", () => {
    expect(lateAfter(at("2026-10-05T18:00:00"), 60)!.toISOString()).toBe("2026-10-05T22:59:59.999Z"); // 23:59:59.999 Lagos
  });
  test("so a workout due 18:00, logged 19:05, pays full XP", () => {
    const workout = task({ tier: null, dueAt: lateAfter(at("2026-10-05T18:00:00"), 60) });
    expect(total(completionXp(workout, at("2026-10-05T19:05:00")))).toBe(10);
  });
  test("…but logged the next morning, it's late", () => {
    const workout = task({ tier: null, dueAt: lateAfter(at("2026-10-05T18:00:00"), 60) });
    expect(total(completionXp(workout, at("2026-10-06T08:00:00")))).toBe(5);
  });
  test("no due time, never late", () => {
    expect(lateAfter(null, 60)).toBeNull();
  });
});

describe("any time ends when quiet hours start", () => {
  const quiet = { dayEndsAt: "22:00" };

  test("an any-time task (stored at 23:59) is late from 22:00", () => {
    expect(lateAfter(at("2026-10-05T23:59:00"), null, undefined, quiet)).toEqual(at("2026-10-05T22:00:00"));
  });
  test("an any-time habit day (no time at all) is late from 22:00 that day", () => {
    expect(lateAfter(null, null, undefined, { ...quiet, occursOn: "2026-10-05" })).toEqual(at("2026-10-05T22:00:00"));
  });
  test("done at 21:30 it's on time; at 22:30 it's late but still pays the late share", () => {
    const read = task({ tier: null, dueAt: lateAfter(null, null, undefined, { ...quiet, occursOn: "2026-10-05" }) });
    expect(total(completionXp(read, at("2026-10-05T21:30:00")))).toBe(10);
    expect(total(completionXp(read, at("2026-10-05T22:30:00")))).toBe(5);
  });
  test("a real deadline keeps its time, even after quiet hours start", () => {
    expect(lateAfter(at("2026-10-05T23:00:00"), null, undefined, quiet)).toEqual(at("2026-10-05T23:00:00"));
  });
  test("a time block is on time until quiet hours start", () => {
    expect(lateAfter(at("2026-10-05T18:00:00"), 60, undefined, quiet)).toEqual(at("2026-10-05T22:00:00"));
  });
  test("a block that starts after quiet hours begin has until the end of its day", () => {
    expect(lateAfter(at("2026-10-05T22:30:00"), 60, undefined, quiet)!.toISOString()).toBe("2026-10-05T22:59:59.999Z");
  });
  test("quiet hours after midnight leave the whole day", () => {
    expect(lateAfter(null, null, undefined, { dayEndsAt: "23:59", occursOn: "2026-10-05" })!.toISOString()).toBe("2026-10-05T22:59:59.999Z");
  });
  test("an undated one-off is never late", () => {
    expect(lateAfter(null, null, undefined, quiet)).toBeNull();
  });
  test("anyTimeEndsAt: only for any-time tasks", () => {
    expect(anyTimeEndsAt(at("2026-10-05T23:59:00"), null, "22:00")).toEqual(at("2026-10-05T22:00:00"));
    expect(anyTimeEndsAt(at("2026-10-05T14:00:00"), null, "22:00")).toBeNull();
    expect(anyTimeEndsAt(null, null, "22:00")).toBeNull();
  });
});
