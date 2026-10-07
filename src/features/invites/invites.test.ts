import { describe, expect, test } from "bun:test";
import { inviteStatus } from "./invites.repo";

const now = new Date("2026-10-09T12:00:00Z");
const row = (extra: Partial<{ used_at: string | null; revoked_at: string | null; expires_at: string }> = {}) => ({
  used_at: null, revoked_at: null, expires_at: "2026-11-08T12:00:00Z", ...extra,
});

describe("inviteStatus", () => {
  test("waiting until used, revoked or expired", () => expect(inviteStatus(row(), now)).toBe("waiting"));
  test("used wins over everything (it did its job)", () =>
    expect(inviteStatus(row({ used_at: "2026-10-01T00:00:00Z", expires_at: "2026-10-02T00:00:00Z" }), now)).toBe("used"));
  test("revoked", () => expect(inviteStatus(row({ revoked_at: "2026-10-05T00:00:00Z" }), now)).toBe("revoked"));
  test("expired at exactly its time", () => expect(inviteStatus(row({ expires_at: now.toISOString() }), now)).toBe("expired"));
});
