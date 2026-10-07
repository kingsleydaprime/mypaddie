"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { PLANS, type PlanId } from "./plans";
import { choosePlan } from "./plans.repo";

export type ChooseState = null | { ok: PlanId } | { error: string };

export async function choosePlanAction(_prev: ChooseState, form: FormData): Promise<ChooseState> {
  const plan = String(form.get("plan") ?? "") as PlanId;
  const period = form.get("period") === "yearly" ? "yearly" : "monthly";
  const student = form.get("student") === "on";
  if (!PLANS.includes(plan)) return { error: "Pick a plan." };
  const db = await requireDb("/app/billing");
  const result = await choosePlan(db, plan, period, student);
  if (result === "payment_required") return { error: "Paid plans need a payment now — checkout is coming. You're still on your current plan." };
  if (result !== "ok") return { error: "That didn't work. Try again." };
  revalidatePath("/app", "layout");
  return { ok: plan };
}
