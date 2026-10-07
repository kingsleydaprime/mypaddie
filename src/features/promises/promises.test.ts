import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { completionXp } from "@/features/xp/xp";
import { DEFAULT_CONFIG } from "@/shared/config";
import { brokenPromiseDeduction, canRenegotiate, isBroken, PROMISE_WEIGHTS, promisePatterns, type PromiseLike, type PromiseRecord } from "./promises";

const at = (local: string) => new Date(`${local}+01:00`);
const p = (extra: Partial<PromiseLike> = {}): PromiseLike => ({ status: "open", dueAt: at("2026-10-10T17:00:00"), keptAt: null, releasedAt: null, ...extra });

describe("isBroken", () => {
  test("not before its day has ended — there's the rest of the day", () => {
    expect(isBroken(p(), at("2026-10-10T23:59:00"))).toBe(false);
  });
  test("its day ended and it wasn't kept: broken", () => {
    expect(isBroken(p(), at("2026-10-11T00:01:00"))).toBe(true);
  });
  test("kept on the day, even after the stated time: not broken", () => {
    expect(isBroken(p({ status: "kept", keptAt: at("2026-10-10T21:00:00") }), at("2026-10-12T09:00:00"))).toBe(false);
  });
  test("kept a day late: still broken", () => {
    expect(isBroken(p({ status: "kept", keptAt: at("2026-10-11T10:00:00") }), at("2026-10-12T09:00:00"))).toBe(true);
  });
  test("released in time: not broken; released after: broken", () => {
    expect(isBroken(p({ status: "released", releasedAt: at("2026-10-09T12:00:00") }), at("2026-10-12T09:00:00"))).toBe(false);
    expect(isBroken(p({ status: "released", releasedAt: at("2026-10-11T12:00:00") }), at("2026-10-12T09:00:00"))).toBe(true);
  });
  test("no deadline: never broken", () => {
    expect(isBroken(p({ dueAt: null }), at("2027-01-01T00:00:00"))).toBe(false);
  });
  test("a late-night deadline counts on its Lagos day (23:30 local = 22:30 UTC)", () => {
    const late = p({ dueAt: at("2026-10-10T23:30:00") });
    expect(isBroken(late, at("2026-10-10T23:45:00"))).toBe(false);
    expect(isBroken(late, at("2026-10-11T00:15:00"))).toBe(true);
  });
});

describe("brokenPromiseDeduction", () => {
  test("weights are valid", () => {
    expect(() => validateWeights(PROMISE_WEIGHTS)).not.toThrow();
  });
  test("its full XP, negative, split like the reward", () => {
    expect(brokenPromiseDeduction(p(), at("2026-10-11T09:00:00"))).toEqual([
      { pillar: "character", amount: -9, reason: "broken_promise" },
      { pillar: "relationships", amount: -6, reason: "broken_promise" },
    ]);
  });
  test("nothing when it isn't broken", () => {
    expect(brokenPromiseDeduction(p(), at("2026-10-10T12:00:00"))).toEqual([]);
  });
  test("the penalty share is configurable", () => {
    const half = brokenPromiseDeduction(p(), at("2026-10-11T09:00:00"), { ...DEFAULT_CONFIG, xp: { ...DEFAULT_CONFIG.xp, brokenPromisePenalty: 0.5 } });
    expect(half.reduce((s, e) => s + e.amount, 0)).toBe(-8);
  });
});

describe("canRenegotiate", () => {
  test("open and its day hasn't ended: yes, even on the day itself", () => {
    expect(canRenegotiate(p(), at("2026-10-10T20:00:00"))).toBe(true);
  });
  test("after its day: too late, it's broken", () => {
    expect(canRenegotiate(p(), at("2026-10-11T08:00:00"))).toBe(false);
  });
  test("kept or released: nothing to renegotiate", () => {
    expect(canRenegotiate(p({ status: "kept" }), at("2026-10-09T08:00:00"))).toBe(false);
  });
  test("no deadline: can always set one", () => {
    expect(canRenegotiate(p({ dueAt: null }), at("2027-01-01T00:00:00"))).toBe(true);
  });
});

describe("promisePatterns", () => {
  const now = at("2026-10-20T12:00:00");
  const r = (person: string, due: string, extra: Partial<PromiseRecord> = {}): PromiseRecord => ({ person, what: "x", status: "open", dueAt: at(due), keptAt: null, releasedAt: null, ...extra });
  test("two or more broken promises to the same person is a pattern; names match ignoring case", () => {
    const list = [r("Ada", "2026-10-01T12:00:00"), r("ada ", "2026-10-05T12:00:00"), r("Ada", "2026-10-08T12:00:00", { status: "kept", keptAt: at("2026-10-08T10:00:00") }), r("Tobi", "2026-10-02T12:00:00")];
    expect(promisePatterns(list, now)).toEqual([{ person: "Ada", broken: 2, kept: 1 }]);
  });
  test("outside the window or still upcoming: ignored", () => {
    expect(promisePatterns([r("Ada", "2026-05-01T12:00:00"), r("Ada", "2026-06-01T12:00:00"), r("Ada", "2026-10-25T12:00:00")], now)).toEqual([]);
  });
});

describe("broken, then kept late", () => {
  test("lose the full XP, then earn back half: net about −50%", () => {
    const due = at("2026-10-10T23:59:00");
    const lost = brokenPromiseDeduction(p({ dueAt: due }), at("2026-10-11T09:00:00")).reduce((s, e) => s + e.amount, 0);
    const late = completionXp(
      { id: "t", status: "pending", tier: null, baseXp: 15, dueAt: due, doneAt: null, weights: PROMISE_WEIGHTS },
      at("2026-10-11T10:00:00"),
    );
    expect(lost).toBe(-15);
    expect(late.every((e) => e.reason === "late_completion")).toBe(true);
    expect(late.reduce((s, e) => s + e.amount, 0)).toBe(8);
    expect(lost + 8).toBe(-7);
  });
  test("kept late, before the deduction ran: still counted as broken", () => {
    expect(isBroken(p({ status: "kept", keptAt: at("2026-10-11T10:00:00") }), at("2026-10-11T11:00:00"))).toBe(true);
  });
});
