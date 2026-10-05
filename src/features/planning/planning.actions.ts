"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { acceptDay } from "./planning.repo";

export async function acceptPlanAction(day: string, assignments: { taskId: string; time: string }[]) {
  const db = await requireDb("/app/plan");
  const results = await acceptDay(db, day, assignments, new Date());
  revalidatePath("/app");
  const failed = results.filter((r) => "result" in r && r.result !== "updated" && r.result !== "habit_not_fixed");
  return { set: results.length - failed.length, failed: failed.length };
}
