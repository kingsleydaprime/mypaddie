import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import type { Mode } from "@/shared/domain";
import { dayKey, startOfNextDay, withinLastDays } from "@/shared/time";

export interface SlipForMode {
  /**
   * What counts as "the same slip": the recurring item's id when there is one
   * (daily Rhapsody is many task rows but one habit), else the task id.
   */
  key: string;
  at: Date;
}

export interface IgnoredNeedForMode {
  key: string;
  dueAt: Date;
}

export interface CheckinForMode {
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  /** Self-reported energy, 1 (empty) to 5 (great). */
  energy: number;
}

export interface ModeOverride {
  mode: "strictest" | "softest";
  /** null means "until switched off". */
  expiresAt: Date | null;
}

export interface ModeInput {
  now: Date;
  slips: readonly SlipForMode[];
  ignoredNeeds: readonly IgnoredNeedForMode[];
  checkins: readonly CheckinForMode[];
  override: ModeOverride | null;
}

export type ModeReason =
  | { kind: "override"; mode: "strictest" | "softest"; expiresAt: Date | null }
  | { kind: "low_energy"; energy: number }
  | { kind: "repeated_slip"; key: string; count: number }
  | { kind: "ignored_needs"; count: number }
  | { kind: "recent_slip"; key: string }
  | { kind: "clean" };

export interface ModeResult {
  mode: Mode;
  /** The facts behind the mode, so the AI picks its tone from data, not vibes. */
  reasons: ModeReason[];
}

/**
 * Picks how firm Paddie should be. Precedence, highest first:
 *   1. an active override ("no mercy mode" / "go easy on me") — your call always wins
 *   2. a low-HP day → soft (a rough day is not slacking, even after repeat slips)
 *   3. a repeated slip or a pile of ignored needs → strict
 *   4. otherwise → curious
 */
export function computeMode(input: ModeInput, config: EngineConfig = DEFAULT_CONFIG): ModeResult {
  const { now } = input;
  const tz = config.timeZone;

  const override = activeOverride(input.override, now);
  if (override) {
    return { mode: override.mode, reasons: [{ kind: "override", ...override }] };
  }

  const today = dayKey(now, tz);
  const todaysCheckin = input.checkins.find((c) => c.day === today);
  if (todaysCheckin && todaysCheckin.energy <= config.mode.lowEnergyMax) {
    return { mode: "soft", reasons: [{ kind: "low_energy", energy: todaysCheckin.energy }] };
  }

  const strictReasons: ModeReason[] = [];

  const recentSlips = input.slips.filter((s) =>
    withinLastDays(s.at, now, config.mode.repeatSlipWindowDays, tz),
  );
  const slipCounts = new Map<string, number>();
  for (const slip of recentSlips) {
    slipCounts.set(slip.key, (slipCounts.get(slip.key) ?? 0) + 1);
  }
  for (const [key, count] of slipCounts) {
    if (count >= config.mode.repeatSlipThreshold) {
      strictReasons.push({ kind: "repeated_slip", key, count });
    }
  }

  const ignoredCount = input.ignoredNeeds.filter((n) =>
    withinLastDays(n.dueAt, now, config.mode.ignoredNeedWindowDays, tz),
  ).length;
  if (ignoredCount >= config.mode.ignoredNeedThreshold) {
    strictReasons.push({ kind: "ignored_needs", count: ignoredCount });
  }

  if (strictReasons.length > 0) return { mode: "strict", reasons: strictReasons };

  const latest = recentSlips.length
    ? recentSlips.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a))
    : null;
  return {
    mode: "curious",
    reasons: latest ? [{ kind: "recent_slip", key: latest.key }] : [{ kind: "clean" }],
  };
}

function activeOverride(override: ModeOverride | null, now: Date): ModeOverride | null {
  if (!override) return null;
  if (override.expiresAt !== null && override.expiresAt.getTime() <= now.getTime()) return null;
  return override;
}

/** "No mercy mode": strictest until switched off. */
export function noMercyOverride(): ModeOverride {
  return { mode: "strictest", expiresAt: null };
}

/** "Go easy on me": softest for the rest of today only. */
export function goEasyOverride(now: Date, config: EngineConfig = DEFAULT_CONFIG): ModeOverride {
  return { mode: "softest", expiresAt: startOfNextDay(now, config.timeZone) };
}
