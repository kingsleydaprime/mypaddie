import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskForm } from "@/features/tasks/ui/task-form";
import { UndoButton } from "@/features/undo/ui/undo-button";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { dayKey, localTimeOf } from "@/shared/time";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

export default async function TaskPage({ params }: PageProps<"/app/tasks/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/tasks/${id}`);
  const { data: t } = await db
    .from("tasks")
    .select("id, title, status, due_at, duration_minutes, is_non_negotiable, reminder_note, series_id")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const due = t.due_at ? new Date(t.due_at) : null;
  const time = due ? localTimeOf(due, tz()) : "";
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="truncate text-2xl font-bold">Edit task</h1>
      </header>
      {t.status === "done" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-muted">Done. Tapped it by mistake?</p>
          <UndoButton kind="task" id={t.id} title={t.title} />
        </div>
      ) : (
        <TaskForm
          task={{
            id: t.id,
            title: t.title,
            date: due ? dayKey(due, tz()) : "",
            // 23:59 is how "any time that day" is stored.
            time: time === "23:59" ? "" : time,
            duration: t.duration_minutes,
            must: t.is_non_negotiable,
            note: t.reminder_note ?? "",
            habit: t.series_id !== null,
          }}
        />
      )}
    </div>
  );
}
