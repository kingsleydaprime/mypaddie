import { describe, expect, test } from "bun:test";
import { DEFAULT_PROFILE } from "@/features/profile/profile";
import { isBroken } from "@/features/promises/promises";
import { isIgnoredNeed } from "@/features/xp/xp";
import { currentConfig } from "./config";
import { formatMoney } from "./format";
import { beginUserContext, contextFor, currentPlan, currentProfile, enterUser, runAs } from "./user-context";

const newYork = contextFor({ ...DEFAULT_PROFILE, timeZone: "America/New_York", currency: "USD", voice: "neutral", displayName: "Sam" });

describe("rules follow the signed-in user", () => {
  test("outside a request (tests): the defaults", () => {
    expect(currentConfig().timeZone).toBe("Africa/Lagos");
    expect(currentProfile()).toEqual(DEFAULT_PROFILE);
  });
  test("inside: their zone, currency and profile", () => {
    runAs(newYork, () => {
      expect(currentConfig()).toMatchObject({ timeZone: "America/New_York", currency: "USD" });
      expect(currentProfile().displayName).toBe("Sam");
      expect(formatMoney(1200)).toBe("$1,200");
    });
  });
  test("still holds after awaiting", async () => {
    await runAs(newYork, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentConfig().timeZone).toBe("America/New_York");
    });
  });
  test("a promise is broken when *their* day ends", () => {
    // Due 10 Oct 23:59 New York = 03:59 UTC on the 11th (= 04:59 Lagos on the 11th).
    const p = { status: "open" as const, dueAt: new Date("2026-10-11T03:59:00Z"), keptAt: null, releasedAt: null };
    const at = new Date("2026-10-11T04:30:00Z"); // 00:30 on the 11th in New York; 05:30 on the 11th in Lagos
    runAs(newYork, () => expect(isBroken(p, at)).toBe(true)); // their 10th is over
    expect(isBroken(p, at)).toBe(false); // read as Lagos, the due day (the 11th) isn't over yet
  });
  test("a need's day ends at their midnight, not Lagos's", () => {
    // Due 22:00 UTC on the 10th = 23:00 Lagos / 18:00 New York, both on the 10th.
    const need = { id: "n", status: "pending" as const, tier: "need" as const, baseXp: 10, dueAt: new Date("2026-10-10T22:00:00Z"), doneAt: null, weights: [{ pillar: "physical" as const, weight: 100 }] };
    const at = new Date("2026-10-11T02:00:00Z"); // 03:00 on the 11th in Lagos; 22:00 on the 10th in New York
    expect(isIgnoredNeed(need, [], at)).toBe(true); // Lagos: the 10th is over
    runAs(newYork, () => expect(isIgnoredNeed(need, [], at)).toBe(false)); // New York: still the 10th
  });
});

describe("server actions see the user (regression: approve bounced on the plan check)", () => {
  // A stand-in for the Supabase client: just enough for loadProfile, loadPlan and the activity touch.
  const fakeDb = (timeZone: string, plan: string) =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { timeZone, onboardedAt: "x" } }, error: null }) }) }) }),
      rpc: async (name: string) => (name === "my_plan" ? { data: { plan, chosen: true }, error: null } : { data: null, error: null }),
    }) as unknown as Parameters<typeof enterUser>[0];

  // Shaped like a server action: load the user inside a helper, then use it.
  const action = async (db: Parameters<typeof enterUser>[0]) => {
    const holder = beginUserContext();
    await Promise.resolve(); // whatever the helper awaits first (cookies, the session…)
    await enterUser(db, holder);
    await new Promise((r) => setTimeout(r, 1));
    return `${currentConfig().timeZone}/${currentPlan().plan}`;
  };

  test("after the helper returns, the action runs as the user", async () => {
    expect(await action(fakeDb("America/New_York", "pro"))).toBe("America/New_York/pro");
  });
  test("two at once don't see each other's user", async () => {
    const [a, b] = await Promise.all([action(fakeDb("Europe/London", "plus")), action(fakeDb("Asia/Tokyo", "free"))]);
    expect([a, b]).toEqual(["Europe/London/plus", "Asia/Tokyo/free"]);
  });
});
