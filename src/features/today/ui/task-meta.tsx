import type { FocusItem } from "../focus";

/** "25m", "1h 05m". */
function hm(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Time put in so far: earlier stretches plus the running one. */
function soFar(spent: number, startedAt: Date | null, now: Date): number {
  return spent + (startedAt ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000)) : 0);
}

/** The line under a task's title: what it's for, whether it's in progress, how far its checklist is. Nothing if none apply. */
export function TaskMeta({ item, now }: { item: Pick<FocusItem, "forLabel" | "startedAt" | "spentMinutes" | "steps" | "priority">; now: Date }) {
  const bits = [
    item.priority === "high" && <span key="h" className="font-medium text-gold">High priority</span>,
    item.priority === "low" && <span key="l">Low priority</span>,
    item.startedAt && <span key="p" className="font-medium text-gold">In progress · {hm(soFar(item.spentMinutes, item.startedAt, now))}</span>,
    !item.startedAt && item.spentMinutes > 0 && <span key="z">Paused · {hm(item.spentMinutes)} so far</span>,
    item.steps && <span key="s">{item.steps.done}/{item.steps.total} steps</span>,
    item.forLabel && <span key="f">{item.forLabel}</span>,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-muted">
      {bits.map((b, i) => (
        <span key={i}>{i > 0 && "· "}{b}</span>
      ))}
    </p>
  );
}
