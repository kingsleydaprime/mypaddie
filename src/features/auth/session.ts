import { serverClient } from "@/shared/supabase/server";

/** Is someone signed in on this request? (Checks the session cookie's token; no redirect.) */
export async function isSignedIn(): Promise<boolean> {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}
