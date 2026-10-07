import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/shared/safe-next";
import { serverClient } from "@/shared/supabase/server";

/**
 * Where Google (and PKCE email links) send people back: swap the one-time code
 * for a session cookie, then carry on. A refused sign-up (no invite) comes
 * back as ?error_description, which the login page shows.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const failed = (message?: string | null) => {
    const to = new URL("/login", url.origin);
    to.searchParams.set("error", "oauth");
    to.searchParams.set("next", next);
    if (message) to.searchParams.set("message", message);
    return NextResponse.redirect(to);
  };
  if (!code) return failed(url.searchParams.get("error_description"));
  const supabase = await serverClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failed(error.message);
  return NextResponse.redirect(new URL(next, url.origin));
}
