import { describe, expect, test } from "bun:test";
import { applyProfileChange, configFor, DEFAULT_PROFILE, isValidCurrency, readProfile } from "./profile";

describe("readProfile", () => {
  test("nothing saved: Lagos, naira, Naija voice, not onboarded", () => {
    expect(readProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(DEFAULT_PROFILE).toMatchObject({ timeZone: "Africa/Lagos", currency: "NGN", voice: "naija", onboardedAt: null });
  });
  test("saved values win; invalid ones fall back field by field", () => {
    expect(readProfile({ timeZone: "Europe/London", currency: "GBP", voice: "neutral", displayName: "  Ada " })).toMatchObject({
      timeZone: "Europe/London", currency: "GBP", voice: "neutral", displayName: "Ada",
    });
    expect(readProfile({ timeZone: "Mars/Olympus", currency: "XYZ", voice: "pirate" })).toMatchObject({
      timeZone: "UTC", currency: "NGN", voice: "naija",
    });
  });
  test("no zone saved stays Lagos; a broken one is UTC", () => {
    expect(readProfile({ currency: "GBP" }).timeZone).toBe("Africa/Lagos");
    expect(readProfile({ timeZone: "" }).timeZone).toBe("Africa/Lagos");
    expect(readProfile({ timeZone: "Africa/Lagoss" }).timeZone).toBe("UTC");
  });
  test("an empty name is no name", () => {
    expect(readProfile({ displayName: "   " }).displayName).toBeNull();
  });
});

describe("isValidCurrency", () => {
  test.each(["NGN", "GHS", "KES", "ZAR", "GBP", "USD", "EUR"])("%s is a currency", (c) => expect(isValidCurrency(c)).toBe(true));
  test.each(["ngn", "NAIRA", "XYZ", "", "N"])("%p isn't", (c) => expect(isValidCurrency(c)).toBe(false));
});

describe("applyProfileChange", () => {
  test("a good change", () => {
    const r = applyProfileChange(DEFAULT_PROFILE, { timeZone: "Africa/Accra", currency: "GHS" });
    expect(r.ok && r.profile).toMatchObject({ timeZone: "Africa/Accra", currency: "GHS", voice: "naija" });
  });
  test("a misspelt zone is refused in words, not read as UTC", () => {
    const r = applyProfileChange(DEFAULT_PROFILE, { timeZone: "Africa/Lagoss" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("isn't a time zone");
  });
  test("a bad currency is refused", () => {
    expect(applyProfileChange(DEFAULT_PROFILE, { currency: "naira" }).ok).toBe(false);
  });
  test("a long name is refused; blank clears it", () => {
    expect(applyProfileChange(DEFAULT_PROFILE, { displayName: "x".repeat(61) }).ok).toBe(false);
    const r = applyProfileChange({ ...DEFAULT_PROFILE, displayName: "Ada" }, { displayName: "  " });
    expect(r.ok && r.profile.displayName).toBeNull();
  });
});

describe("configFor", () => {
  test("their zone and currency, everything else from the engine defaults", () => {
    const c = configFor({ ...DEFAULT_PROFILE, timeZone: "America/New_York", currency: "USD" });
    expect(c.timeZone).toBe("America/New_York");
    expect(c.currency).toBe("USD");
    expect(c.xp.lateMultiplier).toBe(0.5);
  });
});
