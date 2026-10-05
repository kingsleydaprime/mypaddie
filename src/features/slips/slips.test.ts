import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import { judgeSlip, normaliseReason, type SlipReason } from "./slips";

const at = (local: string) => new Date(`${local}+01:00`);

const slip = (local: string, why: string, category: string | null = null, key = "item-rhapsody"): SlipReason => ({
  key,
  why,
  category,
  at: at(local),
});

describe("normaliseReason", () => {
  test("ignores case, punctuation and extra spaces", () => {
    expect(normaliseReason("  I was TIRED!!  ")).toBe("i was tired");
    expect(normaliseReason("i  was tired.")).toBe("i was tired");
  });
  test("keeps non-English letters", () => {
    expect(normaliseReason("Ó dá!")).toBe("ó dá");
  });
});

describe("judgeSlip", () => {
  test("Paddie's no is final — the rule never turns a no into a yes", () => {
    expect(judgeSlip(slip("2026-10-07T08:00:00", "felt like it"), false, [])).toEqual({
      accepted: false,
      by: "paddie",
    });
  });

  test("a first reason Paddie accepts is accepted", () => {
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, [])).toEqual({ accepted: true, by: "paddie" });
  });

  test("the same reason a second time is still accepted", () => {
    const history = [slip("2026-10-05T08:00:00", "tired")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "Tired."), true, history).accepted).toBe(true);
  });

  test("the third time in a week, the same reason is an excuse", () => {
    const history = [slip("2026-10-03T08:00:00", "tired"), slip("2026-10-05T08:00:00", "TIRED")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired!"), true, history)).toEqual({
      accepted: false,
      by: "repeat_rule",
      timesGiven: 3,
    });
  });

  test("Paddie's category catches rewordings of the same reason", () => {
    const history = [
      slip("2026-10-03T08:00:00", "was exhausted", "tired"),
      slip("2026-10-05T08:00:00", "no energy at all", "tired"),
    ];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "so sleepy", "Tired"), true, history).accepted).toBe(false);
  });

  test("different reasons don't add up to an excuse", () => {
    const history = [slip("2026-10-03T08:00:00", "tired"), slip("2026-10-05T08:00:00", "power cut")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, history).accepted).toBe(true);
  });

  test("the same reason on a different habit doesn't count", () => {
    const history = [
      slip("2026-10-03T08:00:00", "tired", null, "item-duolingo"),
      slip("2026-10-05T08:00:00", "tired", null, "item-exercise"),
    ];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, history).accepted).toBe(true);
  });

  test("reasons older than the window are forgiven", () => {
    // Today = day 1, so 7 days back reaches 10-01; 09-30 is outside.
    const history = [slip("2026-09-30T08:00:00", "tired"), slip("2026-10-05T08:00:00", "tired")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, history).accepted).toBe(true);
  });

  test("later slips in the history don't count against an earlier one", () => {
    const history = [slip("2026-10-08T08:00:00", "tired"), slip("2026-10-09T08:00:00", "tired")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, history).accepted).toBe(true);
  });

  test("blank reasons never match each other", () => {
    const history = [slip("2026-10-03T08:00:00", ""), slip("2026-10-05T08:00:00", "!!")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", " "), true, history).accepted).toBe(true);
  });

  test("the threshold comes from config", () => {
    const config = { ...DEFAULT_CONFIG, slips: { ...DEFAULT_CONFIG.slips, excuseRepeatThreshold: 2 } };
    const history = [slip("2026-10-05T08:00:00", "tired")];
    expect(judgeSlip(slip("2026-10-07T08:00:00", "tired"), true, history, config).accepted).toBe(false);
  });
});
