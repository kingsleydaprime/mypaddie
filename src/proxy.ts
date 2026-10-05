import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/shared/supabase/env";

/**
 * Keeps the login session fresh on the pages that use it. Server components
 * can't write cookies, so an expired access token is refreshed here, before
 * the page renders. (Next 16 renamed middleware.ts to proxy.ts.)
 * The MCP endpoint isn't matched: it uses Bearer tokens, not cookies.
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
  await supabase.auth.getClaims(); // triggers the refresh when needed
  return response;
}

export const config = { matcher: ["/login", "/oauth/:path*"] };
