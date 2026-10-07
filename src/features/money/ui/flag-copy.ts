import { formatMoney } from "@/shared/format";
import type { SpendFlag } from "../purchase";

/** Firm about the action, funny about the situation — the joke never replaces the point. */
export function flagMessage(flag: SpendFlag, currency?: string): string {
  switch (flag.kind) {
    case "want_in_deficit":
      return "That was a want, and you're in deficit. The gap just grew. Noted, not punished.";
    case "want_before_needs_covered":
      return `Needs are still ${formatMoney(flag.needsOutstanding, currency)} short this month. Wants wait their turn.`;
    case "over_wants_bucket":
      return `The wants bucket had ${formatMoney(flag.wantsLeft, currency)}. You spent ${formatMoney(flag.spent, currency)}. The maths has opinions.`;
    case "over_cap":
      return `${flag.category} had ${formatMoney(Math.max(0, flag.cap - flag.spentBefore), currency)} left of your own ${formatMoney(flag.cap, currency)} cap. This took it past. Your rule, not mine.`;
  }
}
