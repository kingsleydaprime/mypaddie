import { expect, test } from "bun:test";
import { skipNeedsReason } from "./skip";

test("skipping a non-negotiable needs a reason", () => {
  expect(skipNeedsReason({ isNonNegotiable: true, tier: null })).toBe(true);
  expect(skipNeedsReason({ isNonNegotiable: true, tier: "want" })).toBe(true);
});

test("skipping a need needs a reason, even when it isn't marked must", () => {
  expect(skipNeedsReason({ isNonNegotiable: false, tier: "need" })).toBe(true);
});

test("wants, goals and loose tasks skip freely", () => {
  expect(skipNeedsReason({ isNonNegotiable: false, tier: "want" })).toBe(false);
  expect(skipNeedsReason({ isNonNegotiable: false, tier: "goal" })).toBe(false);
  expect(skipNeedsReason({ isNonNegotiable: false, tier: null })).toBe(false);
});
