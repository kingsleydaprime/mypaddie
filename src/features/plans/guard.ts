import type { Db } from "@/shared/supabase/token-client";
import { currentPlan } from "@/shared/user-context";
import { assertFeature, assertWithinLimit, PLAN_INFO, type Feature, type Limited } from "./plans";

/**
 * Server-side checks against the signed-in user's plan. Each throws a
 * PlanLimitError whose message says what's needed and where to upgrade — the
 * AI shows it as is, and the app's forms return it as their error.
 */
export function requireFeature(feature: Feature) {
  assertFeature(currentPlan().plan, feature);
}

const COUNTERS: Record<Exclude<Limited, "aiApps">, (db: Db) => PromiseLike<number>> = {
  // A habit is a series still recurring (stopping one clears its rule).
  // A routine counts once, however many steps it has; classes don't count.
  habits: async (db) => {
    const { data } = await db.from("tasks").select("series_id, routine_id").not("recurrence", "is", null).not("series_id", "is", null).eq("is_class", false);
    const units = new Set((data ?? []).map((r) => (r.routine_id ? `routine:${r.routine_id}` : `series:${r.series_id}`)));
    return units.size;
  },
  courses: async (db) => (await db.from("courses").select("id", { count: "exact", head: true }).eq("status", "active")).count ?? 0,
  commitments: async (db) => (await db.from("commitments").select("id", { count: "exact", head: true }).eq("status", "active")).count ?? 0,
  applications: async (db) => (await db.from("applications").select("id", { count: "exact", head: true }).in("status", ["researching", "preparing"])).count ?? 0,
  funActivities: async (db) => (await db.from("fun_activities").select("id", { count: "exact", head: true })).count ?? 0,
};

/** Room for `n` more at once (all-or-nothing operations like a timetable)? */
export async function requireRoomFor(db: Db, limited: Exclude<Limited, "aiApps">, n: number) {
  const plan = currentPlan().plan;
  if (n <= 0 || PLAN_INFO[plan].limits[limited] === null) return;
  assertWithinLimit(plan, limited, (await COUNTERS[limited](db)) + n - 1);
}

/** Room for one more? Unlimited plans skip the count. */
export async function requireRoom(db: Db, limited: Exclude<Limited, "aiApps">) {
  const plan = currentPlan().plan;
  if (PLAN_INFO[plan].limits[limited] === null) return;
  assertWithinLimit(plan, limited, await COUNTERS[limited](db));
}
