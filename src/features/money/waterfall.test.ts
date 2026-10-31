import { describe, expect, test } from "bun:test";
import { proposeWaterfall, validateSplit, type WaterfallProposal } from "./waterfall";

const sum = (p: WaterfallProposal) => p.needs + p.buffer + p.savings + p.wants + p.flexible;

describe("proposeWaterfall", () => {
  test("needs first, then the buffer, then 50/30/20", () => {
    const p = proposeWaterfall({
      income: 300_000,
      needsOutstanding: 150_000,
      bufferBalance: 100_000,
      bufferTarget: 150_000,
    });
    expect(p).toEqual({
      needs: 150_000,
      buffer: 50_000,
      savings: 50_000,
      wants: 30_000,
      flexible: 20_000,
      needsShort: false,
    });
  });

  test("the buffer is filled before any investing", () => {
    const p = proposeWaterfall({ income: 40_000, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 150_000 });
    expect(p).toMatchObject({ buffer: 40_000, savings: 0, wants: 0, flexible: 0 });
  });

  test("a full (or overfull) buffer takes nothing", () => {
    const p = proposeWaterfall({ income: 10_000, needsOutstanding: 0, bufferBalance: 200_000, bufferTarget: 150_000 });
    expect(p).toMatchObject({ buffer: 0, savings: 5_000, wants: 3_000, flexible: 2_000 });
  });

  test("income that can't cover needs goes entirely to needs and is flagged", () => {
    const p = proposeWaterfall({ income: 60_000, needsOutstanding: 150_000, bufferBalance: 0, bufferTarget: 150_000 });
    expect(p).toEqual({ needs: 60_000, buffer: 0, savings: 0, wants: 0, flexible: 0, needsShort: true });
  });

  test("every naira is accounted for, even when the split doesn't divide evenly", () => {
    for (const income of [1, 2, 3, 7, 99, 10_001, 333_333]) {
      const p = proposeWaterfall({ income, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 });
      expect(sum(p)).toBe(income);
    }
  });

  test("odd naira go to savings first", () => {
    const p = proposeWaterfall({ income: 1, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 });
    expect(p.savings).toBe(1);
  });

  test("percentages are editable settings, not rules", () => {
    const p = proposeWaterfall({
      income: 100_000,
      needsOutstanding: 0,
      bufferBalance: 0,
      bufferTarget: 0,
      split: { savings: 70, wants: 10, flexible: 20 },
    });
    expect(p).toMatchObject({ savings: 70_000, wants: 10_000, flexible: 20_000 });
  });

  test("a 0% bucket is allowed", () => {
    const p = proposeWaterfall({
      income: 100_000,
      needsOutstanding: 0,
      bufferBalance: 0,
      bufferTarget: 0,
      split: { savings: 80, wants: 0, flexible: 20 },
    });
    expect(p.wants).toBe(0);
    expect(sum(p)).toBe(100_000);
  });

  test("zero income proposes nothing", () => {
    expect(sum(proposeWaterfall({ income: 0, needsOutstanding: 5_000, bufferBalance: 0, bufferTarget: 1 }))).toBe(0);
  });

  test("a decimal income splits exactly: every kobo accounted for", () => {
    const p = proposeWaterfall({ income: 100.5, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 });
    expect(p).toEqual({ needs: 0, buffer: 0, savings: 50.25, wants: 30.15, flexible: 20.1, needsShort: false });
    expect(sum(p)).toBeCloseTo(100.5, 10);
  });

  test("leftover kobo go to savings first, like leftover naira", () => {
    const p = proposeWaterfall({ income: 0.07, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 });
    expect([p.savings, p.wants, p.flexible]).toEqual([0.04, 0.02, 0.01]);
  });

  test("decimal needs and buffer come off first, to the kobo", () => {
    const p = proposeWaterfall({ income: 1_000.75, needsOutstanding: 200.25, bufferBalance: 99.5, bufferTarget: 100 });
    expect([p.needs, p.buffer]).toEqual([200.25, 0.5]);
    expect(p.savings + p.wants + p.flexible).toBeCloseTo(800, 10);
  });

  test("a whole-naira income is never split into kobo", () => {
    const p = proposeWaterfall({ income: 100_001, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 });
    expect([p.savings, p.wants, p.flexible].every(Number.isInteger)).toBe(true);
    expect(sum(p)).toBe(100_001);
  });

  test("rejects negative income", () => {
    expect(() => proposeWaterfall({ income: -1, needsOutstanding: 0, bufferBalance: 0, bufferTarget: 0 })).toThrow(RangeError);
  });
});

describe("validateSplit", () => {
  test.each([
    { savings: 50, wants: 30, flexible: 30 },
    { savings: 50, wants: 30, flexible: 10 },
    { savings: 50.5, wants: 29.5, flexible: 20 },
    { savings: 110, wants: -10, flexible: 0 },
  ])("rejects %o", (split) => {
    expect(() => validateSplit(split)).toThrow(RangeError);
  });
});
