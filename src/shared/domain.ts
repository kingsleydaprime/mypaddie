/**
 * Domain vocabulary shared by every feature. These lists mirror the Postgres
 * enums in supabase/migrations — change one, change the other.
 */

export const PILLARS = [
  "spiritual",
  "mental",
  "physical",
  "financial",
  "emotional",
  "social",
  "character",
  "skills",
  "creativity",
  "relationships",
  // Added 2026-10-05, appended so tie-break order for existing pillars is unchanged.
  "academic",
] as const;
export type Pillar = (typeof PILLARS)[number];

export const TIERS = ["need", "want", "goal", "wish", "dream"] as const;
export type Tier = (typeof TIERS)[number];

/** Modes in the blueprint's table. `strictest`/`softest` only come from an override. */
export type Mode = "curious" | "strict" | "soft" | "strictest" | "softest";

/** Whole units of the user's currency (the name is from when it was naira-only). Integers only, so money maths never meets floating point. */
export type Naira = number;

export function assertNaira(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative whole amount, got ${value}`);
  }
}
