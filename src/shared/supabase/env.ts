/**
 * Public Supabase settings. Both are safe in the browser: the publishable key
 * only identifies the project; RLS decides what any caller can see.
 * There is deliberately no secret/service-role key anywhere in this app.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** Supabase Auth's issuer — the OAuth authorization server Claude signs in with. */
export const authIssuer = () => `${supabaseUrl()}/auth/v1`;
