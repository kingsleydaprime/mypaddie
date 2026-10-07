import { loadOpenPastNeeds } from "@/features/tasks/tasks.repo";
import { isIgnoredNeed } from "@/features/xp/xp";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, withinLastDays } from "@/shared/time";
import { computeMode, type ModeOverride, type ModeResult } from "./mode";

const OVERRIDE_KEY = "mode_override";

function parseOverride(value: unknown): ModeOverride | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { mode?: unknown; expiresAt?: unknown };
  if (v.mode !== "strictest" && v.mode !== "softest") return null;
  const expiresAt = typeof v.expiresAt === "string" ? new Date(v.expiresAt) : null;
  return { mode: v.mode, expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null };
}

/** Loads the facts the mode depends on and computes it. Every tool result carries this. */
export async function loadMode(db: Db, now: Date, config = currentConfig()): Promise<ModeResult> {
  const since = new Date(now.getTime() - (config.mode.repeatSlipWindowDays + 1) * 86_400_000).toISOString();

  const [slipsRes, checkinRes, overrideRes, pastNeeds] = await Promise.all([
    db.from("slips").select("task_id, at, tasks(item_id)").gte("at", since),
    // Only check-ins that rated energy decide a soft day (sleep or mood alone don't).
    db.from("checkins").select("day, energy").eq("day", dayKey(now, config.timeZone)).not("energy", "is", null),
    db.from("settings").select("value").eq("key", OVERRIDE_KEY).maybeSingle(),
    loadOpenPastNeeds(db, now, config),
  ]);
  for (const res of [slipsRes, checkinRes, overrideRes]) {
    if (res.error) throw new Error(`loading mode inputs: ${res.error.message}`);
  }

  const slips = (slipsRes.data ?? []).map((s) => ({
    // "Same slip" = same recurring item when there is one, else the same task.
    key: (s.tasks as { item_id: string | null } | null)?.item_id ?? s.task_id,
    at: new Date(s.at),
  }));

  const ignoredNeeds = pastNeeds.tasks
    .filter((t) => isIgnoredNeed(t, pastNeeds.slips, now, config))
    .filter((t) => withinLastDays(t.dueAt!, now, config.mode.ignoredNeedWindowDays, config.timeZone))
    .map((t) => ({ key: t.itemId ?? t.id, dueAt: t.dueAt! }));

  return computeMode(
    {
      now,
      slips,
      ignoredNeeds,
      checkins: (checkinRes.data ?? []).filter((c): c is { day: string; energy: number } => c.energy !== null),
      override: parseOverride(overrideRes.data?.value),
    },
    config,
  );
}

/** Every tool reply carries the current mode, so the AI always knows how firm to be. */
export async function withMode<T extends Record<string, unknown>>(db: Db, now: Date, data: T) {
  return { ...data, mode: await loadMode(db, now) };
}
