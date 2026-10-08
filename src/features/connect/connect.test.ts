import { describe, expect, test } from "bun:test";
import { consentRules, describeDestination } from "./connect";

describe("describeDestination", () => {
  test("Claude and ChatGPT by their real addresses", () => {
    expect(describeDestination("https://claude.ai/api/mcp/auth_callback")).toEqual({ kind: "known", host: "claude.ai", app: "Claude" });
    expect(describeDestination("https://claude.com/api/mcp/auth_callback")).toMatchObject({ kind: "known", app: "Claude" });
    expect(describeDestination("https://chatgpt.com/connector_platform_oauth_redirect")).toMatchObject({ kind: "known", app: "ChatGPT" });
  });
  test("Gemini by Google's relay, and only the relay's /r/ path", () => {
    expect(describeDestination("https://oauth-redirect.googleusercontent.com/r/abc123")).toEqual({
      kind: "relay",
      host: "oauth-redirect.googleusercontent.com",
      app: "Gemini",
    });
    expect(describeDestination("https://oauth-redirect.googleusercontent.com/other")).toMatchObject({ kind: "unknown" });
    expect(describeDestination("https://evil.googleusercontent.com/r/abc")).toMatchObject({ kind: "unknown" });
    expect(describeDestination("https://x.oauth-redirect.googleusercontent.com/r/abc")).toMatchObject({ kind: "unknown" });
    expect(describeDestination("https://gemini.google.com/cb")).toMatchObject({ kind: "unknown" });
  });
  test("look-alike hosts are not trusted", () => {
    expect(describeDestination("https://claude.ai.evil.example/cb")).toMatchObject({ kind: "unknown", host: "claude.ai.evil.example" });
    expect(describeDestination("https://evilclaude.ai/cb")).toMatchObject({ kind: "unknown" });
    expect(describeDestination("https://claude.ai@evil.example/cb")).toMatchObject({ kind: "unknown", host: "evil.example" });
  });
  test("subdomains of a known app are that app", () => {
    expect(describeDestination("https://www.claude.ai/cb")).toMatchObject({ kind: "known", app: "Claude" });
  });
  test("a program on this computer (MCP inspector, Claude Code)", () => {
    expect(describeDestination("http://localhost:6274/oauth/callback")).toEqual({ kind: "local", host: "localhost:6274" });
    expect(describeDestination("http://127.0.0.1:33418/callback")).toMatchObject({ kind: "local" });
  });
  test("plain http elsewhere is insecure; garbage is invalid", () => {
    expect(describeDestination("http://claude.ai/cb")).toEqual({ kind: "insecure", host: "claude.ai" });
    expect(describeDestination("not a url")).toEqual({ kind: "invalid" });
    expect(describeDestination("javascript:alert(1)")).toEqual({ kind: "invalid" });
  });
});

describe("consentRules", () => {
  test("known apps: one tap", () => expect(consentRules({ kind: "known", host: "claude.ai", app: "Claude" })).toEqual({ canApprove: true, mustConfirm: false }));
  test("a relay (Gemini): named, but still confirmed, since anyone can sit behind it", () =>
    expect(consentRules({ kind: "relay", host: "oauth-redirect.googleusercontent.com", app: "Gemini" })).toEqual({ canApprove: true, mustConfirm: true }));
  test("unknown or local: allowed only after confirming they started it", () => {
    expect(consentRules({ kind: "unknown", host: "x.example" })).toEqual({ canApprove: true, mustConfirm: true });
    expect(consentRules({ kind: "local", host: "localhost:6274" })).toEqual({ canApprove: true, mustConfirm: true });
  });
  test("insecure or invalid: never", () => {
    expect(consentRules({ kind: "insecure", host: "a.example" }).canApprove).toBe(false);
    expect(consentRules({ kind: "invalid" }).canApprove).toBe(false);
  });
});
