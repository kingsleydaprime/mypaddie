import { redirect } from "next/navigation";
import { serverClient } from "./server";
import type { Db } from "./token-client";
import { enterUser } from "../user-context";

/**
 * For app pages and server actions: the signed-in user's client, or a trip to
 * /login that comes back to `returnTo` afterwards. RLS scopes every query.
 * Also loads their profile, so everything after this runs on their time zone
 * and currency.
 */
export async function requireDb(returnTo = "/app"): Promise<Db> {
  const db = await serverClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  await enterUser(db as Db);
  return db as Db;
}
