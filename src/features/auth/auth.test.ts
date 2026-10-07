import { describe, expect, test } from "bun:test";
import { isEmail, loginErrorText, normalizeCode, passwordProblem } from "./auth";

describe("normalizeCode", () => {
  test.each([["abcd efgh", "ABCDEFGH"], ["ABCD-EFGH", "ABCDEFGH"], [" k7m2 p9qr ", "K7M2P9QR"]])("%p → %p", (raw, code) => {
    expect(normalizeCode(raw)).toBe(code);
  });
});

describe("isEmail", () => {
  test("plausible emails", () => {
    expect(isEmail("ada@example.com")).toBe(true);
    expect(isEmail("ada@example")).toBe(false);
    expect(isEmail("ada example.com")).toBe(false);
  });
});

describe("passwordProblem", () => {
  test("at least 10, at most 72 (bcrypt's limit)", () => {
    expect(passwordProblem("short")).toContain("10");
    expect(passwordProblem("a perfectly fine sentence")).toBeNull();
    expect(passwordProblem("x".repeat(73))).toContain("72");
  });
});

describe("loginErrorText", () => {
  test("no error, no text", () => expect(loginErrorText(undefined, undefined)).toBeNull());
  test("the invite hook's message is shown as it is", () => {
    expect(loginErrorText("oauth", "MyPaddie is invite-only for now. Ask whoever told you about it for an invite code.")).toContain("invite-only");
  });
  test("anything else from the URL is replaced with a fixed line", () => {
    expect(loginErrorText("oauth", "<script>alert(1)</script>")).toBe("Google sign-in didn't finish. Try again.");
    expect(loginErrorText("credentials", undefined)).toBe("Wrong email or password.");
    expect(loginErrorText("whatever", "x")).toBe("Something went wrong. Try again.");
  });
});
