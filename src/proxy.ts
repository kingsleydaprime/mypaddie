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
  await supabase.auth.getClaims(); // triggers the refresh when needed
  return response;
}

// Every page except the MCP endpoint and its metadata (Bearer tokens, not
// cookies), Next's static files, icons and the manifest.
export const config = {
  matcher: ["/((?!api/mcp|\\.well-known|_next/static|_next/image|icons|icon|manifest\\.webmanifest|sw\\.js).*)"],
};
