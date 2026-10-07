import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/shared/safe-next";
import { serverClient } from "@/shared/supabase/server";

const TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "recovery", "invite", "email_change"];

/**
 * Email links (sign-in link, confirm sign-up, reset password) land here with a
 * token hash. Verifying it signs them in on whatever device they opened the
 * email on — unlike a code exchange, which needs the browser that asked.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : next, url.origin));
  }
  // A PKCE-style link (?code=) is handled by the callback.
  if (url.searchParams.get("code")) return NextResponse.redirect(new URL(`/auth/callback${url.search}`, url.origin));
  const to = new URL("/login", url.origin);
  to.searchParams.set("error", "link");
  to.searchParams.set("next", next);
  return NextResponse.redirect(to);
}
