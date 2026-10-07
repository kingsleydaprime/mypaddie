import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { isValidTimeZone } from "@/shared/time";

/** How Paddie talks: Naija banter (the default) or a neutral coach. */
export const VOICES = ["naija", "neutral"] as const;
export type Voice = (typeof VOICES)[number];

export interface Profile {
  /** What Paddie calls them. */
  displayName: string | null;
  timeZone: string;
  currency: string;
  voice: Voice;
  /** Set once onboarding is done. */
  onboardedAt: string | null;
}

export const DEFAULT_PROFILE: Profile = {
  displayName: null,
  timeZone: DEFAULT_CONFIG.timeZone,
  currency: DEFAULT_CONFIG.currency,
  voice: "naija",
  onboardedAt: null,
};

/** A real ISO 4217 code this runtime can format ("NGN", "GHS", "USD"). */
export function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency").includes(code);
  } catch {
    return false;
  }
}

/**
 * Saved values merged over the defaults; anything invalid falls back, so a bad
 * value can't break a request. No zone saved = Lagos (what existing accounts
 * run on); a zone that's saved but invalid = UTC, the middle of the world's zones.
 */
export function readProfile(saved: unknown): Profile {
  const v = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const name = typeof v.displayName === "string" ? v.displayName.trim().slice(0, 60) : "";
  return {
    displayName: name || null,
    timeZone: typeof v.timeZone !== "string" || v.timeZone === "" ? DEFAULT_PROFILE.timeZone : isValidTimeZone(v.timeZone) ? v.timeZone : "UTC",
    currency: typeof v.currency === "string" && isValidCurrency(v.currency) ? v.currency : DEFAULT_PROFILE.currency,
    voice: VOICES.includes(v.voice as Voice) ? (v.voice as Voice) : DEFAULT_PROFILE.voice,
    onboardedAt: typeof v.onboardedAt === "string" ? v.onboardedAt : null,
  };
}

export type ProfileChange = Partial<Omit<Profile, "onboardedAt">>;

/** Checks a change as a whole and says what's wrong in words. */
export function applyProfileChange(current: Profile, change: ProfileChange): { ok: true; profile: Profile } | { ok: false; error: string } {
  if (change.timeZone !== undefined && !isValidTimeZone(change.timeZone)) {
    return { ok: false, error: `"${change.timeZone}" isn't a time zone — use a name like Africa/Lagos, Europe/London or America/New_York` };
  }
  if (change.currency !== undefined && !isValidCurrency(change.currency)) {
    return { ok: false, error: `"${change.currency}" isn't a currency code — use three letters like NGN, GHS, KES, GBP or USD` };
  }
  if (change.voice !== undefined && !VOICES.includes(change.voice)) return { ok: false, error: "voice is naija or neutral" };
  if (change.displayName !== undefined && change.displayName !== null && change.displayName.trim().length > 60) {
    return { ok: false, error: "keep the name under 60 characters" };
  }
  return {
    ok: true,
    profile: {
      ...current,
      ...change,
      displayName: change.displayName === undefined ? current.displayName : change.displayName?.trim() || null,
    },
  };
}

/** The engine config for a profile: their days, their money. */
export const configFor = (p: Profile): EngineConfig => ({ ...DEFAULT_CONFIG, timeZone: p.timeZone, currency: p.currency });
