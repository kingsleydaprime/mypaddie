import { describe, expect, test } from "bun:test";
import { computeMoneyStage, topLeaks, totalsOf, type TransactionForMoney } from "./stage";

const at = (local: string) => new Date(`${local}+01:00`);

const income = (amount: number, local: string): TransactionForMoney => ({
  amount,
  direction: "in",
  tag: null,
  category: "salary",
  at: at(local),
});
const spend = (
  amount: number,
  tag: "need" | "want" | "unsure",
  category: string,
  local: string,
): TransactionForMoney => ({ amount, direction: "out", tag, category, at: at(local) });

describe("totalsOf", () => {
  test("unsure counts as a need — overestimating needs is the safer mistake", () => {
    const totals = totalsOf([
      income(100_000, "2026-10-01T09:00:00"),
      spend(40_000, "need", "food", "2026-10-02T09:00:00"),
      spend(10_000, "unsure", "data", "2026-10-02T10:00:00"),
      spend(5_000, "want", "snacks", "2026-10-02T11:00:00"),
    ]);
    expect(totals).toEqual({ income: 100_000, needs: 50_000, wants: 5_000, gap: -50_000 });
  });

  test("rejects kobo, negatives and floats", () => {
    expect(() => totalsOf([spend(-1, "need", "food", "2026-10-02T09:00:00")])).toThrow(RangeError);
    expect(() => totalsOf([spend(10.5, "need", "food", "2026-10-02T09:00:00")])).toThrow(RangeError);
  });
});

describe("topLeaks", () => {
  test("ranks want categories by total spend and keeps the top three", () => {
    const leaks = topLeaks([
      spend(3_000, "want", "snacks", "2026-10-02T09:00:00"),
      spend(4_000, "want", "snacks", "2026-10-03T09:00:00"),
      spend(9_000, "want", "betting", "2026-10-03T09:00:00"),
      spend(2_000, "want", "data bundles", "2026-10-03T09:00:00"),
      spend(1_000, "want", "gum", "2026-10-03T09:00:00"),
      spend(50_000, "need", "rent", "2026-10-03T09:00:00"),
    ]);
    expect(leaks).toEqual([
      { category: "betting", amount: 9_000 },
      { category: "snacks", amount: 7_000 },
      { category: "data bundles", amount: 2_000 },
    ]);
  });

  test("no wants means no leaks", () => {
    expect(topLeaks([spend(1_000, "need", "food", "2026-10-02T09:00:00")])).toEqual([]);
  });
});

describe("computeMoneyStage", () => {
  test("nothing logged yet is audit, day 0", () => {
    const stage = computeMoneyStage([], at("2026-10-05T09:00:00"));
    expect(stage).toMatchObject({ stage: "audit", day: 0, daysLeft: 30 });
  });

  test("the first logging day is day 1 of the audit", () => {
    const stage = computeMoneyStage([spend(500, "need", "food", "2026-10-05T08:00:00")], at("2026-10-05T20:00:00"));
    expect(stage).toMatchObject({ stage: "audit", day: 1, daysLeft: 29 });
  });

  test("audit holds through day 30 even when needs already exceed income — no judgement yet", () => {
    const txs = [income(10_000, "2026-10-01T09:00:00"), spend(90_000, "need", "rent", "2026-10-01T10:00:00")];
    const stage = computeMoneyStage(txs, at("2026-10-30T23:00:00"));
    expect(stage).toMatchObject({ stage: "audit", day: 30, daysLeft: 0 });
  });

  test("day 31 with needs over income is deficit, and the gap is one number", () => {
    const txs = [
      income(100_000, "2026-10-02T09:00:00"),
      spend(120_000, "need", "rent and food", "2026-10-03T09:00:00"),
      spend(30_000, "unsure", "transport", "2026-10-04T09:00:00"),
    ];
    // First log on 10-02 is day 1, so 10-31 is day 30 — still audit.
    expect(computeMoneyStage(txs, at("2026-10-31T09:00:00")).stage).toBe("audit");
    const later = computeMoneyStage(txs, at("2026-11-01T09:00:00")); // day 31
    expect(later).toMatchObject({
      stage: "deficit",
      totals: { income: 100_000, needs: 150_000, gap: 50_000 },
    });
  });

  test("needs exactly equal to income is surplus — income covers needs", () => {
    const txs = [income(100_000, "2026-09-20T09:00:00"), spend(100_000, "need", "rent", "2026-09-21T09:00:00")];
    expect(computeMoneyStage(txs, at("2026-10-20T09:00:00")).stage).toBe("surplus");
  });

  // First log 2026-07-01 = day 1. Periods: days 1–30 (audit, to 07-30),
  // 31–60 (07-31 → 08-29), 61–90 (08-30 → 09-28), 91–120 (09-29 → 10-28).
  const history = [
    spend(500_000, "need", "school fees", "2026-07-01T09:00:00"), // audit period: deep deficit
    income(200_000, "2026-08-30T09:00:00"), // day 61
    spend(80_000, "need", "food", "2026-09-01T09:00:00"),
    spend(20_000, "want", "outings", "2026-09-03T09:00:00"),
    spend(900_000, "need", "rent", "2026-10-01T09:00:00"), // current, unfinished period
  ];

  test("after the audit, the last complete period decides — not older ones, not the current one", () => {
    const stage = computeMoneyStage(history, at("2026-10-07T09:00:00")); // day 99
    expect(stage).toMatchObject({
      stage: "surplus",
      day: 99,
      measured: { fromDay: 61, toDay: 90 },
      totals: { income: 200_000, needs: 80_000, wants: 20_000, gap: -120_000 },
      topLeaks: [{ category: "outings", amount: 20_000 }],
    });
  });

  test("the stage holds steady for the whole period, then moves on", () => {
    expect(computeMoneyStage(history, at("2026-10-28T21:00:00")).stage).toBe("surplus"); // day 120
    // Day 121: the period with the 900k rent is now complete.
    expect(computeMoneyStage(history, at("2026-10-29T08:00:00"))).toMatchObject({
      stage: "deficit",
      measured: { fromDay: 91, toDay: 120 },
      totals: { income: 0, needs: 900_000, gap: 900_000 },
    });
  });

  test("payday sliding around inside a period doesn't flip the stage day to day", () => {
    const txs = [
      income(100_000, "2026-09-01T09:00:00"), // day 1
      spend(90_000, "need", "food", "2026-09-02T09:00:00"),
      income(100_000, "2026-10-04T09:00:00"), // payday early in period 2
      spend(90_000, "need", "food", "2026-10-05T09:00:00"),
    ];
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-30"]) {
      expect(computeMoneyStage(txs, at(`${day}T12:00:00`)).stage).toBe("surplus");
    }
  });

  test("future-dated entries are ignored", () => {
    const stage = computeMoneyStage([spend(500, "need", "food", "2026-10-09T08:00:00")], at("2026-10-05T20:00:00"));
    expect(stage).toMatchObject({ stage: "audit", day: 0 });
  });

  test("the audit clock runs in Lagos days", () => {
    // Logged at 00:30 Lagos on 10-02 (23:30 UTC on 10-01): day 1 is 10-02.
    const txs = [{ ...spend(500, "need", "food", "2026-10-02T00:30:00") }];
    expect(computeMoneyStage(txs, at("2026-10-31T23:00:00"))).toMatchObject({ stage: "audit", day: 30 });
  });
});
