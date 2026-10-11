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

/** A task's priority among its neighbours (mirrors tasks.priority). Most tasks stay normal. */
export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Modes in the blueprint's table. `strictest`/`softest` only come from an override. */
export type Mode = "curious" | "strict" | "soft" | "strictest" | "softest";

/** Units of the user's currency. Can include fractional amounts (kobo / cents). */
export type Naira = number;

export function assertNaira(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative amount, got ${value}`);
  }
}
