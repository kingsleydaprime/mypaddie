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

/**
 * The store is a holder that's filled in later. Why: AsyncLocalStorage.enterWith
 * inside an awaited helper doesn't carry back to the caller once the helper
 * returns — so a server action that loaded the user inside requireDb() then ran
 * its rules on the defaults (Free plan, Lagos). The holder is entered
 * synchronously at the start of the request, before any await, so it belongs
 * to the caller; loading just fills it.
 */
type Holder = { ctx?: UserContext };
const als = new AsyncLocalStorage<Holder>();
const renderCell = cache((): { ctx?: UserContext } => ({}));

function current(): UserContext | undefined {
  const stored = als.getStore()?.ctx;
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

/** "Used MyPaddie today" — one row per user, day and way in (private.activity_days). Best-effort. */
const touch = (db: Db, via: "app" | "ai") => Promise.resolve(db.rpc("touch_activity", { p_via: via })).then(() => undefined, () => undefined);

const load = async (db: Db) => {
  const [profile, plan] = await Promise.all([loadProfile(db), loadPlan(db)]);
  return contextFor(profile, plan);
};

/** Runs `fn` with a given context — tests and scripts that already have a profile. */
export function runAs<T>(ctx: UserContext, fn: () => T): T {
  return als.run({ ctx }, fn);
}

/** Call first thing in a request (before any await): an empty slot the user will be loaded into. */
export function beginUserContext(): Holder {
  const holder: Holder = {};
  als.enterWith(holder);
  return holder;
}

/** Runs `fn` as this user (tool calls, scripts). */
export async function withUser<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await touch(db, "ai");
  const ctx = await load(db);
  return als.run({ ctx }, fn);
}

/** For pages and actions: the rest of this request runs as this user. */
export async function enterUser(db: Db, holder: Holder = beginUserContext()): Promise<UserContext> {
  await touch(db, "app");
  const ctx = await load(db);
  holder.ctx = ctx;
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
