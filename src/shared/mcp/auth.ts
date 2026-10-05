import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/shared/supabase/env";

const verifier = () =>
  createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

/**
 * Turns the Bearer token Claude sends into AuthInfo, or undefined if it isn't
 * a valid, signed-in Supabase user token. `getClaims` checks the signature
 * (locally against the project's published keys when they're asymmetric) and
 * the expiry. Returning undefined makes withMcpAuth answer 401 with a pointer
 * to the login flow.
 */
export async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const { data, error } = await verifier().auth.getClaims(bearerToken);
  if (error || !data) return undefined;

  const claims = data.claims;
  // Anonymous sign-ins also carry role=authenticated; they are not you.
  if (claims.role !== "authenticated" || claims.is_anonymous) return undefined;

  return {
    token: bearerToken,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "unknown",
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: claims.exp,
    extra: { userId: claims.sub },
  };
}
