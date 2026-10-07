import { currentConfig, type EngineConfig } from "@/shared/config";
import { withinLastDays } from "@/shared/time";

export interface SlipReason {
  /** Same meaning as in mode: the recurring item's id, else the task id. */
  key: string;
  /** What you said, in your words. */
  why: string;
  /** Short label Paddie assigns ("tired", "late night") so rewordings still match. */
  category: string | null;
  at: Date;
}

export type SlipVerdict =
  | { accepted: true; by: "paddie" }
  | { accepted: false; by: "paddie" }
  /** Paddie would have accepted it, but it's the same reason too many times. */
  | { accepted: false; by: "repeat_rule"; timesGiven: number };

/** Lowercase, drop punctuation, collapse spaces: "I was TIRED!!" → "i was tired". */
export function normaliseReason(why: string): string {
  return why
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameReason(a: SlipReason, b: SlipReason): boolean {
  if (a.category && b.category) return a.category.trim().toLowerCase() === b.category.trim().toLowerCase();
  const na = normaliseReason(a.why);
  return na.length > 0 && na === normaliseReason(b.why);
}

/**
 * Decides whether a slip's reason is accepted, which is what protects a need
 * from the ignored-need deduction.
 *
 * Paddie judges first (`paddieAccepts`). The repeat rule is a backstop it
 * can't be talked out of: the Nth time the same reason is given for the same
 * habit inside the window, it's an excuse — "the reason hasn't changed, so the
 * plan has to". The rule can only turn a yes into a no, never the reverse.
 */
export function judgeSlip(
  slip: SlipReason,
  paddieAccepts: boolean,
  previous: readonly SlipReason[],
  config: EngineConfig = currentConfig(),
): SlipVerdict {
  if (!paddieAccepts) return { accepted: false, by: "paddie" };

  const earlier = previous.filter(
    (p) =>
      p.key === slip.key &&
      p.at.getTime() < slip.at.getTime() &&
      withinLastDays(p.at, slip.at, config.slips.excuseWindowDays, config.timeZone) &&
      sameReason(p, slip),
  ).length;
  const timesGiven = earlier + 1;

  if (timesGiven >= config.slips.excuseRepeatThreshold) {
    return { accepted: false, by: "repeat_rule", timesGiven };
  }
  return { accepted: true, by: "paddie" };
}
