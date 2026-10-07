import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { configFor, DEFAULT_PROFILE, type Profile } from "@/features/profile/profile";
import { loadProfile } from "@/features/profile/profile.repo";
import { DEFAULT_PLAN_STATE, loadPlan, type PlanState } from "@/features/plans/plans.repo";
import { DEFAULT_CONFIG, setConfigResolver, type EngineConfig } from "./config";
import type { Db } from "./supabase/token-client";

/**
 * Who the current request is for: their profile and the engine config it
 * implies (time zone, currency). Set once per request — by the MCP route for
 * a tool call, by requireDb for a page or server action — and read anywhere
 * below it through currentConfig() / currentProfile().
 *
 * Two carriers, because Next renders server components outside the caller's
 * async flow: AsyncLocalStorage for route handlers and server actions, and a
 * per-render React cache cell for server components.
 */
export interface UserContext {
  profile: Profile;
  config: EngineConfig;
  plan: PlanState;
}

const als = new AsyncLocalStorage<UserContext>();
const renderCell = cache((): { ctx?: UserContext } => ({}));

function current(): UserContext | undefined {
  const stored = als.getStore();
  if (stored) return stored;
  try {
    return renderCell().ctx;
  } catch {
    return undefined;
  }
}

let warned = false;
setConfigResolver(
  () => current()?.config,
  () => {
    // A path that never loaded the user would silently run on Lagos time.
    // Loud everywhere but production (where it logs once and keeps going); tests use the defaults.
    if (process.env.NODE_ENV === "test") return DEFAULT_CONFIG;
    if (process.env.NODE_ENV === "production") {
      if (!warned) console.error("user config missing on a server path — using defaults");
      warned = true;
      return DEFAULT_CONFIG;
    }
    throw new Error("No user config for this request: load it with requireDb() / withUser() first");
  },
);

export const contextFor = (profile: Profile, plan: PlanState = DEFAULT_PLAN_STATE): UserContext => ({ profile, config: configFor(profile), plan });

const load = async (db: Db) => {
  const [profile, plan] = await Promise.all([loadProfile(db), loadPlan(db)]);
  return contextFor(profile, plan);
};

/** Runs `fn` with a given context — tests and scripts that already have a profile. */
export function runAs<T>(ctx: UserContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Runs `fn` as this user (tool calls, scripts). */
export async function withUser<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return als.run(await load(db), fn);
}

/** For pages and actions: the rest of this request runs as this user. */
export async function enterUser(db: Db): Promise<UserContext> {
  const ctx = await load(db);
  als.enterWith(ctx);
  try {
    renderCell().ctx = ctx;
  } catch {
    // Outside a React render (a server action): AsyncLocalStorage carries it.
  }
  return ctx;
}

export function currentProfile(): Profile {
  return current()?.profile ?? DEFAULT_PROFILE;
}

/** The current user's plan (tests and scripts: the default, Free). */
export function currentPlan(): PlanState {
  return current()?.plan ?? DEFAULT_PLAN_STATE;
}
