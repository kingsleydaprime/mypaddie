import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { daysSinceFun, funWeights, suggestFun, whyNot, type FunActivity, type FunContext } from "./fun";

const at = (local: string) => new Date(`${local}+01:00`);
const now = at("2026-10-10T17:30:00");
const fun = (title: string, extra: Partial<FunActivity> = {}): FunActivity => ({
  id: title,
  title,
  notes: null,
  cost: 0,
  minutes: null,
  energy: "medium",
  company: "either",
  active: true,
  timesDone: 0,
  lastDoneAt: null,
  createdAt: at("2026-10-01T12:00:00"),
  ...extra,
});
const ctx = (extra: Partial<FunContext> = {}): FunContext => ({ now, stage: "surplus", wantsLeft: 20_000, mode: "curious", ...extra });

describe("funWeights", () => {
  test("valid weights either way", () => {
    expect(() => validateWeights(funWeights(true))).not.toThrow();
    expect(() => validateWeights(funWeights(false))).not.toThrow();
  });
  test("with people feeds social; alone doesn't", () => {
    expect(funWeights(true).map((w) => w.pillar)).toContain("social");
    expect(funWeights(false).map((w) => w.pillar)).not.toContain("social");
  });
});

describe("daysSinceFun", () => {
  test("no list: null", () => {
    expect(daysSinceFun([], now)).toBeNull();
  });
  test("counts local calendar days from the latest fun, across activities", () => {
    const list = [fun("Movie", { lastDoneAt: at("2026-10-03T22:00:00") }), fun("Football", { lastDoneAt: at("2026-10-07T18:00:00") })];
    expect(daysSinceFun(list, now)).toBe(3);
  });
  test("never used: counts from when the list was started, not forever", () => {
    expect(daysSinceFun([fun("Beach", { createdAt: at("2026-10-08T09:00:00") }), fun("Movie")], now)).toBe(9);
  });
  test("late-night fun counts on its Lagos day (23:30 local = 22:30 UTC)", () => {
    expect(daysSinceFun([fun("Party", { lastDoneAt: at("2026-10-09T23:30:00") })], now)).toBe(1);
  });
  test("fun today: 0", () => {
    expect(daysSinceFun([fun("Walk", { lastDoneAt: at("2026-10-10T07:00:00") })], now)).toBe(0);
  });
});

describe("whyNot", () => {
  test("too long for the gap", () => {
    expect(whyNot(fun("Movie", { minutes: 150 }), ctx({ minutesFree: 90 }))).toBe("too_long");
    expect(whyNot(fun("Movie", { minutes: 90 }), ctx({ minutesFree: 90 }))).toBeNull();
  });
  test("an activity with no set length fits any gap", () => {
    expect(whyNot(fun("Music"), ctx({ minutesFree: 20 }))).toBeNull();
  });
  test("deficit: only free fun", () => {
    expect(whyNot(fun("Cinema", { cost: 5_000 }), ctx({ stage: "deficit" }))).toBe("deficit");
    expect(whyNot(fun("Walk"), ctx({ stage: "deficit" }))).toBeNull();
  });
  test("over what's left for wants", () => {
    expect(whyNot(fun("Concert", { cost: 25_000 }), ctx({ wantsLeft: 20_000 }))).toBe("over_budget");
    expect(whyNot(fun("Concert", { cost: 20_000 }), ctx({ wantsLeft: 20_000 }))).toBeNull();
  });
  test("the audit has no budget, so cost alone never rules it out", () => {
    expect(whyNot(fun("Concert", { cost: 25_000 }), ctx({ stage: "audit", wantsLeft: null }))).toBeNull();
  });
  test("soft days rule out high-energy fun", () => {
    expect(whyNot(fun("Five-a-side", { energy: "high" }), ctx({ mode: "soft" }))).toBe("too_tiring");
    expect(whyNot(fun("Five-a-side", { energy: "high" }), ctx({ mode: "softest" }))).toBe("too_tiring");
    expect(whyNot(fun("Five-a-side", { energy: "high" }), ctx({ mode: "strict" }))).toBeNull();
  });
  test("company", () => {
    expect(whyNot(fun("Read", { company: "solo" }), ctx({ withPeople: true }))).toBe("wrong_company");
    expect(whyNot(fun("Hangout", { company: "together" }), ctx({ withPeople: false }))).toBe("wrong_company");
    expect(whyNot(fun("Movie", { company: "either" }), ctx({ withPeople: true }))).toBeNull();
  });
});

describe("suggestFun", () => {
  test("least recently done first; never done before anything done", () => {
    const list = [
      fun("Movie", { lastDoneAt: at("2026-10-08T20:00:00") }),
      fun("Beach", { lastDoneAt: at("2026-09-20T12:00:00") }),
      fun("Arcade"),
    ];
    expect(suggestFun(list, ctx()).map((s) => s.title)).toEqual(["Arcade", "Beach", "Movie"]);
  });
  test("cheaper first on a tie", () => {
    expect(suggestFun([fun("Cinema", { cost: 5_000 }), fun("Walk")], ctx()).map((s) => s.title)).toEqual(["Walk", "Cinema"]);
  });
  test("skips inactive and ones that don't fit; respects the limit", () => {
    const list = [fun("Old hobby", { active: false }), fun("Concert", { cost: 50_000 }), fun("A"), fun("B"), fun("C"), fun("D")];
    expect(suggestFun(list, ctx(), 3).map((s) => s.title)).toEqual(["A", "B", "C"]);
  });
  test("soft day: low energy leads, even if done recently", () => {
    const list = [fun("Gym class", { energy: "medium" }), fun("Nap and music", { energy: "low", lastDoneAt: at("2026-10-09T15:00:00") })];
    expect(suggestFun(list, ctx({ mode: "soft" }))[0]!.title).toBe("Nap and music");
  });
  test("reports days since each was done", () => {
    const [s] = suggestFun([fun("Movie", { lastDoneAt: at("2026-10-05T21:00:00") })], ctx());
    expect(s!.daysSince).toBe(5);
    expect(suggestFun([fun("New")], ctx())[0]!.daysSince).toBeNull();
  });
  test("nothing fits: empty, not an error", () => {
    expect(suggestFun([fun("Trip", { cost: 100_000 })], ctx({ stage: "deficit" }))).toEqual([]);
  });
});
