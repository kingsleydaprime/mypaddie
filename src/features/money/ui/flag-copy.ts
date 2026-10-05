import { formatNaira } from "@/shared/format";
import type { SpendFlag } from "../purchase";

/** Firm about the action, funny about the situation — the joke never replaces the point. */
export function flagMessage(flag: SpendFlag): string {
  switch (flag.kind) {
    case "want_in_deficit":
      return "That was a want, and you're in deficit. The gap just grew. Noted, not punished.";
    case "want_before_needs_covered":
      return `Needs are still ${formatNaira(flag.needsOutstanding)} short this month. Wants wait their turn.`;
    case "over_wants_bucket":
      return `The wants bucket had ${formatNaira(flag.wantsLeft)}. You spent ${formatNaira(flag.spent)}. The maths has opinions.`;
  }
}
