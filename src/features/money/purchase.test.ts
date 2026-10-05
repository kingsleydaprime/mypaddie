import { describe, expect, test } from "bun:test";
import { flagSpend, judgePurchase, monthlyNeedsTotal, needsOutstanding, type PurchaseInput } from "./purchase";

const now = new Date("2026-10-06T12:00:00+01:00");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

function input(overrides: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    price: 20_000,
    stage: "surplus",
    needInDisguise: false,
    servesGoal: null,
    needsOutstanding: 0,
    wantsLeft: 50_000,
    waitingSince: null,
    now,
    ...overrides,
  };
}

describe("judgePurchase", () => {
  test("a need in disguise is a yes, even in deficit", () => {
    expect(judgePurchase(input({ needInDisguise: true, stage: "deficit" })).verdict).toBe("yes");
  });

  test("deficit mode: wants get nothing", () => {
    expect(judgePurchase(input({ stage: "deficit", servesGoal: "learn guitar" }))).toEqual({
      verdict: "no",
      reasons: [{ kind: "deficit" }],
    });
  });

  test("needs not covered this month: no", () => {
    expect(judgePurchase(input({ needsOutstanding: 12_000 }))).toEqual({
      verdict: "no",
      reasons: [{ kind: "needs_not_covered", needsOutstanding: 12_000 }],
    });
  });

  test("more than the wants bucket holds: no, even if it serves a goal", () => {
    expect(judgePurchase(input({ price: 60_000, servesGoal: "learn guitar" })).verdict).toBe("no");
  });

  test("exactly what the wants bucket holds is allowed", () => {
    expect(judgePurchase(input({ price: 50_000, servesGoal: "learn guitar" })).verdict).toBe("yes");
  });

  test("serves a goal: yes", () => {
    expect(judgePurchase(input({ servesGoal: "learn guitar" }))).toEqual({
      verdict: "yes",
      reasons: [{ kind: "serves_goal", goal: "learn guitar" }],
    });
  });

  test("a plain want: wait 24 hours, with when to ask again", () => {
    expect(judgePurchase(input())).toEqual({
      verdict: "wait_24h",
      reasons: [{ kind: "cooling_off", askAgainAfter: new Date(now.getTime() + 86_400_000) }],
    });
  });

  test("asking again after 24 hours: yes", () => {
    expect(judgePurchase(input({ waitingSince: hoursAgo(25) })).verdict).toBe("yes");
  });

  test("asking again too soon: still wait, and the clock doesn't restart", () => {
    const waitingSince = hoursAgo(10);
    expect(judgePurchase(input({ waitingSince }))).toEqual({
      verdict: "wait_24h",
      reasons: [{ kind: "cooling_off", askAgainAfter: new Date(waitingSince.getTime() + 86_400_000) }],
    });
  });

  test("audit: no budgets, so deficit-ish numbers don't block — but still a 24-hour wait", () => {
    const decision = judgePurchase(input({ stage: "audit", needsOutstanding: 99_000, wantsLeft: 0 }));
    expect(decision.verdict).toBe("wait_24h");
    expect(decision.reasons[0]).toEqual({ kind: "audit_no_budget" });
  });

  test("audit: serving a goal is still a yes", () => {
    expect(judgePurchase(input({ stage: "audit", servesGoal: "learn guitar" })).verdict).toBe("yes");
  });
});

describe("flagSpend", () => {
  const base = { amount: 10_000, tag: "want" as const, stage: "surplus" as const, needsOutstanding: 0, wantsLeft: 50_000 };

  test("a want within budget in surplus is fine", () => {
    expect(flagSpend(base)).toEqual([]);
  });

  test("flags every problem at once", () => {
    expect(flagSpend({ ...base, stage: "deficit", needsOutstanding: 5_000, amount: 60_000 })).toEqual([
      { kind: "want_in_deficit" },
      { kind: "want_before_needs_covered", needsOutstanding: 5_000 },
      { kind: "over_wants_bucket", wantsLeft: 50_000, spent: 60_000 },
    ]);
  });

  test.each(["need", "unsure"] as const)("%p spending is never judged", (tag) => {
    expect(flagSpend({ ...base, tag, stage: "deficit", needsOutstanding: 5_000 })).toEqual([]);
  });

  test("the audit is judgement-free", () => {
    expect(flagSpend({ ...base, stage: "audit", needsOutstanding: 5_000, amount: 99_000 })).toEqual([]);
  });
});

describe("needs budgeting", () => {
  test("monthly total uses comfortable, else floor, else nothing", () => {
    expect(
      monthlyNeedsTotal([
        { floor: 30_000, comfortable: 40_000 },
        { floor: 10_000, comfortable: null },
        { floor: null, comfortable: null },
      ]),
    ).toBe(50_000);
  });

  test("outstanding = month − spent − set aside, never negative", () => {
    expect(needsOutstanding(150_000, 60_000, 40_000)).toBe(50_000);
    expect(needsOutstanding(150_000, 160_000, 0)).toBe(0);
    expect(needsOutstanding(0, 0, 0)).toBe(0);
  });
});
