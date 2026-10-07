import { PLAN_INFO } from "@/features/plans/plans";
import type { Db } from "@/shared/supabase/token-client";
import { currentPlan } from "@/shared/user-context";
import { loadConnectedApps } from "./connect.repo";

/**
 * May this user connect one more AI app? Reconnecting an app they already
 * allowed doesn't count. Returns the reason in words when not.
 */
export async function aiAppRoom(db: Db, clientId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const plan = currentPlan().plan;
  const limit = PLAN_INFO[plan].limits.aiApps;
  if (limit === null) return { ok: true };
  const apps = await loadConnectedApps(db);
  if (apps.some((a) => a.clientId === clientId) || apps.length < limit) return { ok: true };
  return {
    ok: false,
    message: `${PLAN_INFO[plan].name} connects ${limit} AI app${limit === 1 ? "" : "s"}, and you have ${apps.length} (${apps.map((a) => a.name).join(", ")}). Disconnect one in Settings → Connect your AI, or see plans.`,
  };
}
