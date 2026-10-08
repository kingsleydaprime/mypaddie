/**
 * Where an AI app's access really goes. With dynamic client registration,
 * anyone can register a client and *call* it "Claude"; the name is just a
 * claim. What can't be faked is the redirect URI the approval is sent to, so
 * the consent page judges by that.
 */
const KNOWN: { hosts: string[]; name: string }[] = [
  { hosts: ["claude.ai", "claude.com"], name: "Claude" },
  { hosts: ["chatgpt.com", "chat.openai.com"], name: "ChatGPT" },
];

/**
 * Google's account-linking relay, where Gemini custom apps send the approval
 * (https://oauth-redirect.googleusercontent.com/r/<connector id>). It's a real
 * Google address, but the relay forwards to whichever Google project the id
 * names, and anyone can make one, so it still needs "I started this myself".
 */
const RELAYS: { host: string; pathPrefix: string; name: string }[] = [
  { host: "oauth-redirect.googleusercontent.com", pathPrefix: "/r/", name: "Gemini" },
];

export type Destination =
  | { kind: "known"; host: string; app: string }
  | { kind: "relay"; host: string; app: string }
  | { kind: "local"; host: string }
  | { kind: "unknown"; host: string }
  /** Plain http to another machine: tokens could be read in transit. Never allowed. */
  | { kind: "insecure"; host: string }
  | { kind: "invalid" };

export function describeDestination(redirectUri: string): Destination {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return { kind: "invalid" };
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (local) return { kind: "local", host: url.host };
  if (url.protocol !== "https:") return url.protocol === "http:" ? { kind: "insecure", host } : { kind: "invalid" };
  const relay = RELAYS.find((r) => host === r.host && url.pathname.startsWith(r.pathPrefix));
  if (relay) return { kind: "relay", host, app: relay.name };
  const known = KNOWN.find((k) => k.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return known ? { kind: "known", host, app: known.name } : { kind: "unknown", host };
}

/** May the person approve this at all, and must they confirm they started it themselves? */
export function consentRules(d: Destination): { canApprove: boolean; mustConfirm: boolean } {
  switch (d.kind) {
    case "known":
      return { canApprove: true, mustConfirm: false };
    case "relay":
    case "local":
    case "unknown":
      return { canApprove: true, mustConfirm: true };
    default:
      return { canApprove: false, mustConfirm: false };
  }
}
