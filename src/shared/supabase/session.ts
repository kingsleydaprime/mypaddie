import { redirect } from "next/navigation";
import { serverClient } from "./server";
import type { Db } from "./token-client";
import { beginUserContext, enterUser } from "../user-context";

/**
 * For app pages and server actions: the signed-in user's client, or a trip to
 * /login that comes back to `returnTo` afterwards. RLS scopes every query.
 * Also loads their profile, so everything after this runs on their time zone
 * and currency.
 */
export async function requireDb(returnTo = "/app"): Promise<Db> {
  // Before any await: the slot belongs to the caller (the page or action), not just to this helper.
  const holder = beginUserContext();
  const db = await serverClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  await enterUser(db as Db, holder);
  return db as Db;
}
