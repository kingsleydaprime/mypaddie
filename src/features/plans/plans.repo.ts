import type { Db } from "@/shared/supabase/token-client";
import { PLANS, type PlanId } from "./plans";

export interface PlanState {
  plan: PlanId;
  /** False = on the app default, never chose. */
  chosen: boolean;
  period: "monthly" | "yearly";
  student: boolean;
  trialEndsAt: string | null;
  paymentsEnabled: boolean;
}

export const DEFAULT_PLAN_STATE: PlanState = { plan: "free", chosen: false, period: "monthly", student: false, trialEndsAt: null, paymentsEnabled: false };

export async function loadPlan(db: Db): Promise<PlanState> {
  const { data, error } = await db.rpc("my_plan");
  if (error || !data) return DEFAULT_PLAN_STATE;
  const v = data as Partial<PlanState>;
  return {
    plan: PLANS.includes(v.plan as PlanId) ? (v.plan as PlanId) : "free",
    chosen: Boolean(v.chosen),
    period: v.period === "yearly" ? "yearly" : "monthly",
    student: Boolean(v.student),
    trialEndsAt: v.trialEndsAt ?? null,
    paymentsEnabled: Boolean(v.paymentsEnabled),
  };
}

export async function choosePlan(db: Db, plan: PlanId, period: "monthly" | "yearly", student: boolean) {
  const { data, error } = await db.rpc("choose_plan", { p_plan: plan, p_period: period, p_student: student });
  if (error) throw new Error(`choosing the plan: ${error.message}`);
  return data as "ok" | "invalid" | "payment_required";
}
