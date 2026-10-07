import { assertNaira, type Naira } from "@/shared/domain";
import type { CapFlag, CapStatus } from "./guardrails";
import type { MoneyStage } from "./stage";

export type PurchaseVerdict = "yes" | "wait_24h" | "no";

export type PurchaseReason =
  | { kind: "need_in_disguise" }
  | { kind: "deficit" }
  | { kind: "needs_not_covered"; needsOutstanding: Naira }
  | { kind: "over_wants_bucket"; wantsLeft: Naira; price: Naira }
  | { kind: "over_cap"; category: string; capLeft: Naira; price: Naira }
  | { kind: "serves_goal"; goal: string }
  | { kind: "waited_24h" }
  | { kind: "cooling_off"; askAgainAfter: Date }
  | { kind: "audit_no_budget" };

export interface PurchaseInput {
  price: Naira;
  stage: MoneyStage["stage"];
  /** The AI's judgement: is this actually a need? */
  needInDisguise: boolean;
  /** Title of the goal it serves, as judged by the AI; null if none. */
  servesGoal: string | null;
  /** Unfunded needs this month after what's already in the needs bucket. */
  needsOutstanding: Naira;
  /** What's left in the wants bucket. */
  wantsLeft: Naira;
  /** Their own monthly cap for this purchase's category, if they set one. */
  cap?: CapStatus | null;
  /** When this same item last got "wait 24 hours", if it did. */
  waitingSince: Date | null;
  now: Date;
}

export interface PurchaseDecision {
  verdict: PurchaseVerdict;
  reasons: PurchaseReason[];
}

const WAIT_MS = 24 * 60 * 60 * 1000;

/**
 * The don't-buy-this check. First matching rule wins:
 *   1. a need in disguise                    → yes (log it as a need)
 *   — during the audit there are no budgets, so only 5–8 apply —
 *   2. deficit mode                          → no
 *   3. this month's needs not yet covered    → no
 *   4. costs more than the wants bucket has  → no
 *   5. breaks their own cap for the category → no (in every stage: it's their limit)
 *   6. serves one of your goals              → yes
 *   7. asked again after a 24-hour wait      → yes
 *   8. otherwise                             → wait 24 hours
 */
export function judgePurchase(input: PurchaseInput): PurchaseDecision {
  assertNaira(input.price, "price");
  const { now } = input;

  if (input.needInDisguise) return { verdict: "yes", reasons: [{ kind: "need_in_disguise" }] };

  const reasons: PurchaseReason[] = [];
  if (input.stage === "audit") {
    reasons.push({ kind: "audit_no_budget" });
  } else {
    if (input.stage === "deficit") return { verdict: "no", reasons: [{ kind: "deficit" }] };
    if (input.needsOutstanding > 0) {
      return { verdict: "no", reasons: [{ kind: "needs_not_covered", needsOutstanding: input.needsOutstanding }] };
    }
    if (input.price > input.wantsLeft) {
      return {
        verdict: "no",
        reasons: [{ kind: "over_wants_bucket", wantsLeft: input.wantsLeft, price: input.price }],
      };
    }
  }

  if (input.cap && input.price > input.cap.left) {
    return { verdict: "no", reasons: [...reasons, { kind: "over_cap", category: input.cap.category, capLeft: input.cap.left, price: input.price }] };
  }

  if (input.servesGoal) return { verdict: "yes", reasons: [...reasons, { kind: "serves_goal", goal: input.servesGoal }] };

  if (input.waitingSince && now.getTime() - input.waitingSince.getTime() >= WAIT_MS) {
    return { verdict: "yes", reasons: [...reasons, { kind: "waited_24h" }] };
  }

  const from = input.waitingSince ?? now;
  return {
    verdict: "wait_24h",
    reasons: [...reasons, { kind: "cooling_off", askAgainAfter: new Date(from.getTime() + WAIT_MS) }],
  };
}

export type SpendFlag =
  | { kind: "want_in_deficit" }
  | CapFlag
  | { kind: "want_before_needs_covered"; needsOutstanding: Naira }
  | { kind: "over_wants_bucket"; wantsLeft: Naira; spent: Naira };

/**
 * After the fact: was this spend a bad call? Only wants are ever flagged —
 * needs and "unsure" are not judged — and nothing is flagged during the audit,
 * which is explicitly judgement-free. Flags never cost XP: honest logging
 * always pays.
 */
export function flagSpend(input: {
  amount: Naira;
  tag: "need" | "want" | "unsure";
  stage: MoneyStage["stage"];
  needsOutstanding: Naira;
  /** Wants bucket balance *before* this spend. */
  wantsLeft: Naira;
}): SpendFlag[] {
  if (input.tag !== "want" || input.stage === "audit") return [];
  const flags: SpendFlag[] = [];
  if (input.stage === "deficit") flags.push({ kind: "want_in_deficit" });
  if (input.needsOutstanding > 0) {
    flags.push({ kind: "want_before_needs_covered", needsOutstanding: input.needsOutstanding });
  }
  if (input.amount > input.wantsLeft) {
    flags.push({ kind: "over_wants_bucket", wantsLeft: input.wantsLeft, spent: input.amount });
  }
  return flags;
}

export interface NeedBudget {
  floor: Naira | null;
  comfortable: Naira | null;
}

/** A month of needs, at the comfortable level where known, else the floor. */
export function monthlyNeedsTotal(needs: readonly NeedBudget[]): Naira {
  return needs.reduce((sum, n) => sum + (n.comfortable ?? n.floor ?? 0), 0);
}

/**
 * Needs still unfunded this month: the month's needs, minus what's already
 * been spent on needs, minus what's sitting in the needs bucket for them.
 */
export function needsOutstanding(monthlyTotal: Naira, spentOnNeedsThisMonth: Naira, needsBucket: Naira): Naira {
  return Math.max(0, monthlyTotal - spentOnNeedsThisMonth - needsBucket);
}
