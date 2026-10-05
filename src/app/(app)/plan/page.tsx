import Link from "next/link";
import { proposeDay } from "@/features/planning/planning.repo";
import { AcceptPlan } from "@/features/planning/ui/accept-plan";
import { DEFAULT_CONFIG } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { dayKey, localTimeOf } from "@/shared/time";

const tz = DEFAULT_CONFIG.timeZone;
const STYLE: Record<string, string> = {
  event: "border-l-gold",
  fixed_task: "border-l-gold",
  meal: "border-l-green",
  task: "border-l-text",
  chores: "border-l-muted",
  free: "border-l-green",
};

export default async function PlanPage() {
  const db = await requireDb("/plan");
  const now = new Date();
  const day = dayKey(now, tz);
  const plan = await proposeDay(db, day, now);
  const writable = plan.assignments.filter((a) => !a.suggestionOnly).map((a) => ({ taskId: a.taskId, time: localTimeOf(a.start, tz) }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">Your day</h1>
      </header>
      <ol className="flex flex-col gap-2">
        {plan.slots.map((s, i) => (
          <li key={i} className={`rounded-xl border border-line border-l-4 bg-surface px-4 py-2.5 ${STYLE[s.kind] ?? ""}`}>
            <span className="text-sm text-muted">{localTimeOf(s.start, tz)}–{localTimeOf(s.end, tz)}</span>
            <p className={`font-medium ${s.kind === "free" ? "text-green" : ""}`}>{s.title}</p>
          </li>
        ))}
      </ol>
      {(plan.unplaced.length > 0 || plan.overCapacity.length > 0) && (
        <p className="text-sm text-muted">
          Didn&apos;t fit today: {[...plan.unplaced, ...plan.overCapacity].map((u) => u.title).join(", ")}.
        </p>
      )}
      <p className="text-sm text-muted">Ask Paddie what to eat for the meal slots, or to move anything around.</p>
      <AcceptPlan day={day} assignments={writable} />
    </div>
  );
}
