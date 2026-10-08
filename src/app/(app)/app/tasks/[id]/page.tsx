import Link from "next/link";
import { notFound } from "next/navigation";
import { readChecklist } from "@/features/tasks/progress";
import { DoingPanel } from "@/features/tasks/ui/doing-panel";
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
    .select("id, title, status, due_at, duration_minutes, is_non_negotiable, is_self_care, reminder_note, series_id, commitment_id, course_id, is_class, details, started_at, checklist")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  // What it can be "for": their roles (not ended) and courses (still running).
  const [{ data: roles }, { data: courses }] = await Promise.all([
    db.from("commitments").select("id, title, org").neq("status", "ended").order("title"),
    db.from("courses").select("id, code, title").eq("status", "active").order("title"),
  ]);
  const forOptions = [
    ...(roles ?? []).map((r) => ({ value: `role:${r.id}`, label: r.org ? `${r.title} · ${r.org}` : r.title, group: "Roles" as const })),
    ...(courses ?? []).map((c) => ({ value: `course:${c.id}`, label: c.code ? `${c.code} · ${c.title}` : c.title, group: "Courses" as const })),
  ];
  const forValue = t.commitment_id ? `role:${t.commitment_id}` : t.course_id ? `course:${t.course_id}` : "";

  const steps = readChecklist(t.checklist);
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
        <>
          {t.status === "pending" && <DoingPanel id={t.id} title={t.title} startedAt={t.started_at} steps={steps} />}
          <TaskForm
            task={{
              id: t.id,
              title: t.title,
              date: due ? dayKey(due, tz()) : "",
              // 23:59 is how "any time that day" is stored.
              time: time === "23:59" ? "" : time,
              duration: t.duration_minutes,
              must: t.is_non_negotiable,
              selfCare: t.is_self_care,
              note: t.reminder_note ?? "",
              details: t.details ?? "",
              checklist: steps.map((st) => st.text).join("\n"),
              habit: t.series_id !== null,
              forValue,
              // A timetable class belongs to its course; changing that is set_timetable's job.
              forLocked: t.is_class,
            }}
            forOptions={forOptions}
          />
        </>
      )}
    </div>
  );
}
