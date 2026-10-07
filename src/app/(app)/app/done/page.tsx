import Link from "next/link";
import { recentUndoable } from "@/features/undo/undo.repo";
import { UndoButton } from "@/features/undo/ui/undo-button";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";

const KIND_LABEL = { task: "Task", fun: "Fun", workout: "Workout", learning: "Learning", slip: "Slip" } as const;

export default async function DonePage() {
  const db = await requireDb("/app/done");
  const recent = await recentUndoable(db, new Date(), undefined, 30);
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: currentConfig().timeZone });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">Done recently</h1>
      </header>
      <p className="text-sm text-muted">The last 48 hours. Tapped the wrong one? Undo takes the XP back and puts it back on your list.</p>
      {recent.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.title}</p>
                <p className="text-sm text-muted">{KIND_LABEL[r.kind]} · {when(r.at)}</p>
              </div>
              <UndoButton kind={r.kind} id={r.id} title={r.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
