/** What the sign-up page says for each invite check result (public.claim_invite). */
export const CLAIM_MESSAGES: Record<string, string> = {
  bad_email: "That email doesn't look right.",
  invalid: "That invite code isn't valid. Check it, or ask for a new one.",
  used: "That invite has already been used. Ask for a new one.",
  expired: "That invite has expired. Ask for a new one.",
  has_account: "You already have an account with that email — sign in instead.",
  other_email: "That invite is for a different email. Use the email it was sent to.",
};

/** Codes are typed by hand from WhatsApp messages: forgive case, spaces and dashes. */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Passwords: long beats clever. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Use at least 10 characters — a short sentence works well.";
  if (p.length > 72) return "Keep it under 72 characters.";
  return null;
}

/**
 * Sign-in errors arrive as ?error=<kind>&message=<from Supabase>. Only the
 * hook's own invite messages are shown as-is; everything else gets a fixed
 * line, so nothing odd from the URL is ever displayed.
 */
export function loginErrorText(kind: string | undefined, message: string | undefined): string | null {
  if (!kind) return null;
  if (message && /invite/i.test(message) && message.length < 200) return message;
  switch (kind) {
    case "credentials":
      return "Wrong email or password.";
    case "link":
      return "That link has expired or was already used. Ask for a new one below.";
    case "oauth":
      return "Google sign-in didn't finish. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}
