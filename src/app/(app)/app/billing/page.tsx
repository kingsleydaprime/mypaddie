import Link from "next/link";
import { billingCurrency } from "@/features/plans/plans";
import { PlanPicker } from "@/features/plans/ui/plan-picker";
import { requireDb } from "@/shared/supabase/session";
import { currentPlan, currentProfile } from "@/shared/user-context";

export default async function BillingPage() {
  await requireDb("/app/billing");
  const plan = currentPlan();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/settings" className="text-muted" aria-label="Back to settings">‹ Settings</Link>
        <h1 className="text-2xl font-bold">Plan</h1>
      </header>
      {!plan.paymentsEnabled && (
        <p className="rounded-2xl border border-gold bg-surface p-4 text-sm">
          <span className="font-semibold">Early access:</span> nothing is charged yet. Every plan is free to use — switch any time.
        </p>
      )}
      <PlanPicker current={plan.plan} currency={billingCurrency(currentProfile().currency)} period={plan.period} student={plan.student} paymentsEnabled={plan.paymentsEnabled} />
      <p className="text-xs text-muted">Your data stays yours on every plan, including export and deleting your account.</p>
    </div>
  );
}
