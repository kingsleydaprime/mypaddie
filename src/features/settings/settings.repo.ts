import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { applyScheduleChange, readSchedule, type Schedule, type ScheduleChange } from "./schedule";

const KEY = "schedule";

export async function loadSchedule(db: Db): Promise<Schedule> {
  const { data, error } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw new Error(`loading settings: ${error.message}`);
  return readSchedule(data?.value);
}

/** Validates the change against the whole schedule before saving. */
export async function updateSchedule(db: Db, change: ScheduleChange) {
  const result = applyScheduleChange(await loadSchedule(db), change);
  if (!result.ok) return result;
  const { error } = await db
    .from("settings")
    .upsert({ key: KEY, value: result.schedule as unknown as { [key: string]: Json } }, { onConflict: "user_id,key" });
  if (error) throw new Error(`saving settings: ${error.message}`);
  return result;
}
