import Link from "next/link";
import { recentUndoable, type Undoable } from "@/features/undo/undo.repo";
import { UndoButton } from "@/features/undo/ui/undo-button";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";

const KIND_LABEL = { task: "Task", fun: "Fun", workout: "Workout", learning: "Learning", slip: "Slip" } as const;

export default async function DonePage() {
  const db = await requireDb("/app/done");
  const { timeZone } = currentConfig();
  const now = new Date();
  const today = dayKey(now, timeZone);
  const recent = await recentUndoable(db, now, undefined, 30);

  // Grouped by the day it was ticked; a task ticked for another day says which.
  const byDay = new Map<string, Undoable[]>();
  for (const r of recent) {
    const d = dayKey(new Date(r.at), timeZone);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const dayLabel = (day: string) =>
    day === today ? "Today"
    : day === addDays(today, -1) ? "Yesterday"
    : zonedInstant(day, "12:00", timeZone).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/app" className="text-sm text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">Done recently</h1>
        <p className="text-sm text-muted">The last 48 hours, by the day you ticked it. Tapped the wrong one? Undo takes the XP back and puts it back on your list.</p>
      </header>

      {recent.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nothing yet.</p>
      ) : (
        [...byDay].map(([day, rows]) => (
          <section key={day} aria-label={dayLabel(day)} className="flex flex-col gap-1">
            <h2 className="sticky top-0 z-10 bg-bg/90 py-1 text-xs font-semibold uppercase tracking-wider text-muted backdrop-blur">
              {dayLabel(day)}
            </h2>
            <ol className="ml-1 border-l border-line pl-5">
              {rows.map((r) => {
                const other = r.forDay && r.forDay !== day ? r.forDay : null;
                return (
                  <li key={`${r.kind}-${r.id}`} className="relative flex items-center justify-between gap-3 py-2">
                    <span className={`absolute -left-[1.6rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full ${r.kind === "slip" ? "bg-line" : "bg-green"}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.title}</p>
                      <p className="truncate text-xs text-muted">
                        {KIND_LABEL[r.kind]} · {localTimeOf(new Date(r.at), timeZone)}
                        {other && <span className="text-gold"> · for {dayLabel(other)}</span>}
                      </p>
                    </div>
                    <UndoButton kind={r.kind} id={r.id} title={r.title} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
