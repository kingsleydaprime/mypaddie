import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import { computeMode, goEasyOverride, noMercyOverride, type ModeInput } from "./mode";

const at = (local: string) => new Date(`${local}+01:00`);
const now = at("2026-10-07T12:00:00");

function input(overrides: Partial<ModeInput> = {}): ModeInput {
  return { now, slips: [], ignoredNeeds: [], checkins: [], override: null, ...overrides };
}

const rhapsody = (local: string) => ({ key: "item-rhapsody", at: at(local) });
const ignored = (local: string, key = "item-bath") => ({ key, dueAt: at(local) });

describe("curious (the default)", () => {
  test("a clean record is curious, with nothing to name", () => {
    expect(computeMode(input())).toEqual({ mode: "curious", reasons: [{ kind: "clean" }] });
  });

  test("a first, one-off slip is curious and names the slip", () => {
    expect(computeMode(input({ slips: [rhapsody("2026-10-07T07:00:00")] }))).toEqual({
      mode: "curious",
      reasons: [{ kind: "recent_slip", key: "item-rhapsody" }],
    });
  });

  test("different slips on different habits are one-offs, not a repeat", () => {
    const slips = [rhapsody("2026-10-06T07:00:00"), { key: "item-duolingo", at: at("2026-10-07T09:00:00") }];
    const result = computeMode(input({ slips }));
    expect(result.mode).toBe("curious");
    expect(result.reasons).toEqual([{ kind: "recent_slip", key: "item-duolingo" }]);
  });

  test("ignored needs below the threshold stay curious", () => {
    const ignoredNeeds = [ignored("2026-10-06T07:00:00"), ignored("2026-10-05T07:00:00", "item-food")];
    expect(computeMode(input({ ignoredNeeds })).mode).toBe("curious");
  });
});

describe("strict", () => {
  test("the same slip repeated inside 7 days is strict", () => {
    const slips = [rhapsody("2026-10-03T07:00:00"), rhapsody("2026-10-07T07:00:00")];
    expect(computeMode(input({ slips }))).toEqual({
      mode: "strict",
      reasons: [{ kind: "repeated_slip", key: "item-rhapsody", count: 2 }],
    });
  });

  test("repeats outside the 7-day window don't count", () => {
    // 2026-09-30 is 8 calendar days ago counting today as day 1.
    const slips = [rhapsody("2026-09-30T07:00:00"), rhapsody("2026-10-07T07:00:00")];
    expect(computeMode(input({ slips })).mode).toBe("curious");
  });

  test("the window edge: exactly 7 calendar days back (today = day 1) still counts", () => {
    const slips = [rhapsody("2026-10-01T00:00:00"), rhapsody("2026-10-07T07:00:00")];
    expect(computeMode(input({ slips })).mode).toBe("strict");
  });

  test("three ignored needs in the last 3 days is strict", () => {
    const ignoredNeeds = [
      ignored("2026-10-05T07:00:00"),
      ignored("2026-10-06T07:00:00", "item-food"),
      ignored("2026-10-06T21:00:00", "item-brush"),
    ];
    expect(computeMode(input({ ignoredNeeds }))).toEqual({
      mode: "strict",
      reasons: [{ kind: "ignored_needs", count: 3 }],
    });
  });

  test("ignored needs older than 3 days don't pile up", () => {
    const ignoredNeeds = [
      ignored("2026-10-04T07:00:00"),
      ignored("2026-10-06T07:00:00", "item-food"),
      ignored("2026-10-06T21:00:00", "item-brush"),
    ];
    expect(computeMode(input({ ignoredNeeds })).mode).toBe("curious");
  });

  test("both triggers at once report both reasons", () => {
    const result = computeMode(
      input({
        slips: [rhapsody("2026-10-06T07:00:00"), rhapsody("2026-10-07T07:00:00")],
        ignoredNeeds: [
          ignored("2026-10-05T07:00:00"),
          ignored("2026-10-06T07:00:00"),
          ignored("2026-10-06T08:00:00"),
        ],
      }),
    );
    expect(result.mode).toBe("strict");
    expect(result.reasons.map((r) => r.kind)).toEqual(["repeated_slip", "ignored_needs"]);
  });

  test("thresholds come from config", () => {
    const config = { ...DEFAULT_CONFIG, mode: { ...DEFAULT_CONFIG.mode, repeatSlipThreshold: 3 } };
    const slips = [rhapsody("2026-10-06T07:00:00"), rhapsody("2026-10-07T07:00:00")];
    expect(computeMode(input({ slips }), config).mode).toBe("curious");
  });
});

describe("soft (low-HP day)", () => {
  test("low energy today is soft", () => {
    expect(computeMode(input({ checkins: [{ day: "2026-10-07", energy: 2 }] }))).toEqual({
      mode: "soft",
      reasons: [{ kind: "low_energy", energy: 2 }],
    });
  });

  test("a rough day beats repeated slips: rough is not slacking", () => {
    const result = computeMode(
      input({
        slips: [rhapsody("2026-10-06T07:00:00"), rhapsody("2026-10-07T07:00:00")],
        checkins: [{ day: "2026-10-07", energy: 1 }],
      }),
    );
    expect(result.mode).toBe("soft");
  });

  test("energy 3 is not low", () => {
    expect(computeMode(input({ checkins: [{ day: "2026-10-07", energy: 3 }] })).mode).toBe("curious");
  });

  test("yesterday's low energy doesn't soften today", () => {
    expect(computeMode(input({ checkins: [{ day: "2026-10-06", energy: 1 }] })).mode).toBe("curious");
  });
});

describe("overrides — your call always wins", () => {
  test("no mercy mode beats a low-HP day", () => {
    const result = computeMode(
      input({ override: noMercyOverride(), checkins: [{ day: "2026-10-07", energy: 1 }] }),
    );
    expect(result.mode).toBe("strictest");
    expect(result.reasons).toEqual([{ kind: "override", mode: "strictest", expiresAt: null }]);
  });

  test("no mercy mode never expires on its own", () => {
    expect(computeMode(input({ now: at("2027-06-01T00:00:00"), override: noMercyOverride() })).mode).toBe(
      "strictest",
    );
  });

  test("go easy on me beats repeated slips", () => {
    const result = computeMode(
      input({
        override: goEasyOverride(at("2026-10-07T09:00:00")),
        slips: [rhapsody("2026-10-06T07:00:00"), rhapsody("2026-10-07T07:00:00")],
      }),
    );
    expect(result.mode).toBe("softest");
  });

  test("go easy on me lasts until local midnight, then normal rules resume", () => {
    const override = goEasyOverride(at("2026-10-07T09:00:00"));
    expect(override.expiresAt?.toISOString()).toBe("2026-10-07T23:00:00.000Z"); // 00:00 Lagos
    expect(computeMode(input({ now: at("2026-10-07T23:59:00"), override })).mode).toBe("softest");
    expect(computeMode(input({ now: at("2026-10-08T00:00:00"), override })).mode).toBe("curious");
  });
});
