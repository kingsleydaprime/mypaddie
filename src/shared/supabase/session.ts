import { redirect } from "next/navigation";
import { serverClient } from "./server";
import type { Db } from "./token-client";

/**
 * For app pages and server actions: the signed-in user's client, or a trip to
 * /login that comes back to `returnTo` afterwards. RLS scopes every query.
 */
export async function requireDb(returnTo = "/"): Promise<Db> {
  const db = await serverClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return db as Db;
}
