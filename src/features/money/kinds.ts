import type { BucketName } from "./money.repo";

/**
 * What a money entry is. Only income and spending ("normal") count towards
 * the audit, buckets, splits and XP; everything else just changes the balance.
 *   - moved:  money moving in or out of what MyPaddie tracks (from or to
 *             another account of theirs). Not earned, not spent.
 *   - repaid: a debt someone paid back to them, logged by hand.
 *   - refund: a shop or person gave money back.
 *   - loan:   borrowing or lending, recorded by the debt tools.
 *   - opening / adjustment: setting the balance.
 */
export const ENTRY_KINDS = ["normal", "moved", "repaid", "refund", "loan", "opening", "adjustment"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** What money in can be, as the user picks it. */
export const MONEY_IN_TYPES = ["income", "moved", "repaid", "refund"] as const;
export type MoneyInType = (typeof MONEY_IN_TYPES)[number];
/** What money out can be: spending (tagged) or just moved. */
export const MONEY_OUT_TYPES = ["need", "want", "unsure", "moved"] as const;
export type MoneyOutType = (typeof MONEY_OUT_TYPES)[number];

export const IN_LABEL: Record<MoneyInType, string> = { income: "Income", moved: "Money moved in", repaid: "Debt repaid", refund: "Refund" };
export const OUT_LABEL: Record<MoneyOutType, string> = { need: "Need", want: "Want", unsure: "Not sure", moved: "Money moved out" };
export const KIND_LABEL: Record<EntryKind, string> = {
  normal: "",
  moved: "Money moved",
  repaid: "Debt repaid",
  refund: "Refund",
  loan: "Loan",
  opening: "Opening balance",
  adjustment: "Balance correction",
};

/** The stored kind and tag for what they picked. A spend is "normal" with its tag; anything else is untagged. */
export function entryOf(
  direction: "in" | "out",
  type: MoneyInType | MoneyOutType,
): { kind: EntryKind; tag: "need" | "want" | "unsure" | null } {
  if (direction === "in") {
    if (!(MONEY_IN_TYPES as readonly string[]).includes(type)) throw new RangeError(`"${type}" isn't a kind of money in`);
    return { kind: type === "income" ? "normal" : (type as EntryKind), tag: null };
  }
  if (!(MONEY_OUT_TYPES as readonly string[]).includes(type)) throw new RangeError(`"${type}" isn't a kind of money out`);
  return type === "moved" ? { kind: "moved", tag: null } : { kind: "normal", tag: type as "need" | "want" | "unsure" };
}

/** Only real income gets a proposed split (and can be split into buckets). */
export const isIncome = (e: { kind: EntryKind | string; direction: "in" | "out" }) => e.kind === "normal" && e.direction === "in";

/** Which bucket a spend draws from: wants for a want; needs for a need or a not-sure. */
export const bucketOf = (tag: "need" | "want" | "unsure"): BucketName => (tag === "want" ? "wants" : "needs");

/**
 * Changing a spend's tag: the amount goes back to the old bucket and comes out
 * of the new one, as if it had been logged right. Need ↔ not sure share the
 * needs bucket, so nothing moves.
 */
export function retagMove(from: "need" | "want" | "unsure", to: "need" | "want" | "unsure"): { from: BucketName; to: BucketName } | null {
  return bucketOf(from) === bucketOf(to) ? null : { from: bucketOf(from), to: bucketOf(to) };
}
