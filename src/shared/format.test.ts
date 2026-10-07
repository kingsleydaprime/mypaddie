import { describe, expect, test } from "bun:test";
import { currencySymbol, formatMoney, parseAmount } from "./format";

describe("formatMoney", () => {
  test("whole units in the given currency", () => {
    expect(formatMoney(150000, "NGN")).toBe("₦150,000");
    expect(formatMoney(85, "GBP")).toBe("£85");
    expect(formatMoney(1200, "USD")).toBe("$1,200");
  });
  test("defaults to the current user's currency (naira outside a request)", () => {
    expect(formatMoney(5000)).toBe("₦5,000");
  });
  test("negative amounts", () => {
    expect(formatMoney(-3000, "NGN")).toBe("-₦3,000");
  });
});

describe("currencySymbol", () => {
  test.each([["NGN", "₦"], ["GBP", "£"], ["EUR", "€"]])("%s → %s", (code, symbol) => {
    expect(currencySymbol(code)).toBe(symbol);
  });
  test("cedi and shilling come back as something readable", () => {
    expect(currencySymbol("GHS").length).toBeGreaterThan(0);
    expect(currencySymbol("KES").length).toBeGreaterThan(0);
  });
});

describe("parseAmount", () => {
  test.each([["₦85,000", 85000], ["85 000", 85000], ["$1,200", 1200], ["GH₵ 300", 300], ["-500", -500]])("%s → %d", (raw, n) => {
    expect(parseAmount(raw)).toBe(n);
  });
  test("nothing numeric is 0, which callers reject", () => {
    expect(parseAmount("abc")).toBe(0);
  });
});
