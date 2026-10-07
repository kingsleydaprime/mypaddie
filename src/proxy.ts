import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/shared/supabase/env";

/**
 * Keeps the login session fresh on the pages that use it. Server components
 * can't write cookies, so an expired access token is refreshed here, before
 * the page renders. (Next 16 renamed middleware.ts to proxy.ts.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims(); // also triggers the refresh when needed
  const path = request.nextUrl.pathname;

  // Decided here, before any page starts streaming, so they're real redirects
  // (the app's loading screen would otherwise turn them into a refresh after it).
  const redirectTo = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };
  if ((path === "/app" || path.startsWith("/app/")) && !data?.claims) {
    return redirectTo(`/login?next=${encodeURIComponent(path + request.nextUrl.search)}`);
  }
  if (path === "/app" && data?.claims) {
    // First visit: set up before anything else (see app/(app)/app/page.tsx).
    const { data: profile } = await supabase.from("settings").select("value").eq("key", "profile").maybeSingle();
    if (!(profile?.value as { onboardedAt?: string } | null)?.onboardedAt) return redirectTo("/welcome");
  }
  return response;
}

// Every page except the MCP endpoint and its metadata (Bearer tokens, not
// cookies), the push route (called by the database), Next's static files, icons and the manifest.
export const config = {
  matcher: ["/((?!api/mcp|api/push|\\.well-known|_next/static|_next/image|icons|icon|manifest\\.webmanifest|sw\\.js).*)"],
};
