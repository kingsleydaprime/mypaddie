import { describe, expect, test } from "bun:test";
import { balanceOf, correctionFor } from "./balance";

describe("balanceOf", () => {
  test("in minus out, voided entries ignored", () => {
    expect(
      balanceOf([
        { amount: 85_000, direction: "in", voided: false },
        { amount: 3_000, direction: "out", voided: false },
        { amount: 50_000, direction: "in", voided: true },
        { amount: 1_500, direction: "out", voided: false },
      ]),
    ).toBe(80_500);
  });
  test("can go negative (overspent, or something wasn't logged)", () => {
    expect(balanceOf([{ amount: 500, direction: "out", voided: false }])).toBe(-500);
  });
  test("nothing logged is zero", () => {
    expect(balanceOf([])).toBe(0);
  });
});

describe("correctionFor", () => {
  test("first time: the opening balance", () => {
    expect(correctionFor(85_000, 0, false)).toEqual({ kind: "opening", direction: "in", amount: 85_000 });
  });
  test("later: a correction for the difference, either way", () => {
    expect(correctionFor(80_000, 80_500, true)).toEqual({ kind: "adjustment", direction: "out", amount: 500 });
    expect(correctionFor(81_000, 80_500, true)).toEqual({ kind: "adjustment", direction: "in", amount: 500 });
  });
  test("already right: nothing to record", () => {
    expect(correctionFor(80_500, 80_500, true)).toBeNull();
  });
  test("rejects negative or fractional amounts", () => {
    expect(() => correctionFor(-1, 0, false)).toThrow(RangeError);
    expect(() => correctionFor(10.5, 0, false)).toThrow(RangeError);
  });
});
