/**
 * Only allow redirects to paths on this site. "/oauth/consent?x" is fine;
 * "https://evil.com", "//evil.com" and "/\evil.com" (which browsers treat as
 * another host) are not — otherwise the login page becomes an open redirect.
 */
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
