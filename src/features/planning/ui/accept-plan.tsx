"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptPlanAction } from "../planning.actions";

export function AcceptPlan({ day, assignments }: { day: string; assignments: { taskId: string; time: string }[] }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ set: number; failed: number } | null>(null);
  if (done) {
    return (
      <div className="flex flex-col gap-2 text-center" role="status">
        <p className="font-semibold text-green">Plan set{done.failed ? ` (${done.failed} couldn't be placed — open them to see why)` : ""}.</p>
        <Link href="/app" className="text-muted">Back to Today</Link>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pending || assignments.length === 0}
      onClick={() => start(async () => setDone(await acceptPlanAction(day, assignments)))}
      className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60"
    >
      {pending ? "Setting…" : assignments.length ? "Accept this plan" : "Nothing to set"}
    </button>
  );
}
