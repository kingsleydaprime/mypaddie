import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

export type Db = SupabaseClient<Database>;

/**
 * A client that acts as whoever owns `accessToken`. Every query it makes runs
 * under that user's RLS policies — this is how MCP tools touch only your rows.
 * One per request: no session is stored or refreshed.
 */
export function clientForToken(accessToken: string): Db {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
