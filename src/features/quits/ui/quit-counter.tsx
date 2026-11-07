import type { Quit } from "../quits.repo";
import { daysLabel, milestoneProgress, unitLabel } from "./labels";

/** The big number, the best and total, and a thin bar to the next milestone. */
export function QuitCounter({ quit, size = "lg" }: { quit: Quit; size?: "lg" | "md" }) {
  const { progress: p, kind, unit } = quit;
  const active = quit.status === "active";
  const bar = active ? milestoneProgress(p.currentDays) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <span className={`font-bold tabular-nums leading-none ${active ? "text-gold" : "text-muted"} ${size === "lg" ? "text-6xl" : "text-4xl"}`}>
          {active ? p.currentDays : "–"}
        </span>
        <span className="text-sm text-muted">{active ? daysLabel(kind, p.currentDays) : quit.status === "paused" ? "paused" : "ended"}</span>
      </p>
      {bar && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={bar.pct}
          aria-label={`${bar.next - p.currentDays} days to the ${bar.next}-day milestone`}
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(bar.pct, 3)}%` }} />
        </div>
      )}
      <p className="text-xs text-muted">
        {[
          `Best ${p.longestDays} ${p.longestDays === 1 ? "day" : "days"}`,
          `${p.totalCleanDays} clean in total`,
          bar ? `${bar.next - p.currentDays} to day ${bar.next}` : null,
          p.today && active ? `today ${p.today.used}/${p.today.cap} ${unitLabel(unit, p.today.cap)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {p.today?.over && active && <p className="text-xs text-red">Over today&apos;s cap. The streak starts again tomorrow.</p>}
    </div>
  );
}
