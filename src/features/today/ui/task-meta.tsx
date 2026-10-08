import type { FocusItem } from "../focus";

/** "25m", "1h 05m" — how long it's been in progress. */
function since(startedAt: Date, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** The line under a task's title: what it's for, whether it's in progress, how far its checklist is. Nothing if none apply. */
export function TaskMeta({ item, now }: { item: Pick<FocusItem, "forLabel" | "startedAt" | "steps">; now: Date }) {
  const bits = [
    item.startedAt && <span key="p" className="font-medium text-gold">In progress · {since(item.startedAt, now)}</span>,
    item.steps && <span key="s">{item.steps.done}/{item.steps.total} steps</span>,
    item.forLabel && <span key="f">for {item.forLabel}</span>,
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
