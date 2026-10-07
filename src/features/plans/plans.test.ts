import { describe, expect, test } from "bun:test";
import { limitText, assertFeature, assertWithinLimit, billingCurrency, cheapestWith, hasFeature, PLAN_INFO, PlanLimitError, priceFor } from "./plans";

describe("plans", () => {
  test("each tier includes everything below it", () => {
    for (const f of PLAN_INFO.plus.features) expect(PLAN_INFO.pro.features).toContain(f);
    for (const [k, v] of Object.entries(PLAN_INFO.free.limits)) {
      const plus = PLAN_INFO.plus.limits[k as keyof typeof PLAN_INFO.plus.limits];
      expect(plus === null || plus >= (v ?? Infinity)).toBe(true);
    }
  });
  test("yearly is two months free", () => {
    for (const p of ["plus", "pro"] as const) {
      expect(PLAN_INFO[p].price.USD.yearly).toBe(PLAN_INFO[p].price.USD.monthly * 10);
      expect(PLAN_INFO[p].price.NGN.yearly).toBe(PLAN_INFO[p].price.NGN.monthly * 10);
    }
  });
});

describe("limits", () => {
  test("within the limit is fine; at it, adding one more isn't", () => {
    expect(() => assertWithinLimit("free", "habits", 4)).not.toThrow();
    expect(() => assertWithinLimit("free", "habits", 5)).toThrow(PlanLimitError);
  });
  test("the message says what, how many, and where to go", () => {
    try {
      assertWithinLimit("free", "aiApps", 1);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanLimitError);
      expect((e as PlanLimitError).upgradeTo).toBe("plus");
      expect((e as Error).message).toContain("Free allows 1 AI app connected");
      expect((e as Error).message).toContain("Settings → Plan");
    }
  });
  test("unlimited is unlimited", () => expect(() => assertWithinLimit("pro", "aiApps", 500)).not.toThrow());
  test("past Plus's 3 AI apps, the way up is Pro", () => expect(cheapestWith({ limited: "aiApps", count: 3 })).toBe("pro"));
});

describe("features", () => {
  test("free lacks the planning features; plus has them", () => {
    expect(() => assertFeature("free", "studyPlans")).toThrow("Study plans is on Plus");
    expect(() => assertFeature("plus", "calendarImport")).not.toThrow();
  });
  test("a coming-soon feature isn't 'had' yet, even on Pro", () => {
    expect(hasFeature("pro", "builtInChat")).toBe(false);
    expect(hasFeature("pro", "studyPlans")).toBe(true);
  });
});

describe("prices", () => {
  test("students pay half; Nigerians are billed in naira", () => {
    expect(priceFor("plus", "USD", "monthly", false)).toBe(10);
    expect(priceFor("plus", "USD", "monthly", true)).toBe(5);
    expect(priceFor("pro", "NGN", "yearly", true)).toBe(75_000);
    expect(billingCurrency("NGN")).toBe("NGN");
    expect(billingCurrency("GHS")).toBe("USD");
  });
});

describe("limitText", () => {
  test("singular, plural, unlimited", () => {
    expect(limitText("courses", 1)).toBe("1 course");
    expect(limitText("courses", 3)).toBe("3 courses");
    expect(limitText("aiApps", null)).toBe("Unlimited AI apps connected");
    expect(limitText("commitments", 1)).toBe("1 job, role or team");
  });
});
