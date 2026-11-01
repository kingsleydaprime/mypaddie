import { describe, expect, test } from "bun:test";
import { entryOf, isIncome, retagMove } from "./kinds";

describe("money in isn't always income", () => {
  test("income is a normal entry: it counts and gets a split", () => {
    expect(entryOf("in", "income")).toEqual({ kind: "normal", tag: null });
    expect(isIncome({ kind: "normal", direction: "in" })).toBe(true);
  });

  test("money moved in from another account, a debt paid back, or a refund only change the balance", () => {
    for (const type of ["moved", "repaid", "refund"] as const) {
      const e = entryOf("in", type);
      expect(e).toEqual({ kind: type, tag: null });
      expect(isIncome({ ...e, direction: "in" })).toBe(false);
    }
  });

  test("money moved out isn't spending: no tag, no bucket", () => {
    expect(entryOf("out", "moved")).toEqual({ kind: "moved", tag: null });
  });

  test("spending keeps its tag", () => {
    expect(entryOf("out", "want")).toEqual({ kind: "normal", tag: "want" });
    expect(entryOf("out", "unsure")).toEqual({ kind: "normal", tag: "unsure" });
  });

  test("a refund or repaid debt can't go out, and a tag can't come in", () => {
    expect(() => entryOf("out", "refund" as never)).toThrow(RangeError);
    expect(() => entryOf("out", "repaid" as never)).toThrow(RangeError);
    expect(() => entryOf("in", "need" as never)).toThrow(RangeError);
  });

  test("an opening balance or a loan is never income", () => {
    expect(isIncome({ kind: "opening", direction: "in" })).toBe(false);
    expect(isIncome({ kind: "loan", direction: "in" })).toBe(false);
  });
});

describe("changing a spend's tag moves its money between buckets", () => {
  test("want → need: back to wants, out of needs", () => {
    expect(retagMove("want", "need")).toEqual({ from: "wants", to: "needs" });
  });

  test("need → want: back to needs, out of wants", () => {
    expect(retagMove("need", "want")).toEqual({ from: "needs", to: "wants" });
  });

  test("need ↔ not sure share the needs bucket: nothing moves", () => {
    expect(retagMove("need", "unsure")).toBeNull();
    expect(retagMove("unsure", "need")).toBeNull();
  });
});
