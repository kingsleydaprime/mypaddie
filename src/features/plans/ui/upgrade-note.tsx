import Link from "next/link";
import { cheapestWith, FEATURE_LABEL, PLAN_INFO, type Feature } from "../plans";

/** A quiet line where a paid feature would be. Never a wall. */
export function UpgradeNote({ feature }: { feature: Feature }) {
  const plan = PLAN_INFO[cheapestWith({ feature })];
  return (
    <p className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <span className="font-semibold">{FEATURE_LABEL[feature]}</span> is on {plan.name}.{" "}
      <Link href="/app/billing" className="text-gold underline">See plans</Link>
    </p>
  );
}
