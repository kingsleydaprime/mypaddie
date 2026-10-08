import Link from "next/link";
import { loadCourses } from "@/features/courses/courses.repo";
import { AddCourseForm } from "@/features/courses/ui/course-forms";
import { requireDb } from "@/shared/supabase/session";

export default async function CoursesPage() {
  const db = await requireDb("/app/courses");
  const courses = await loadCourses(db, new Date(), { includeFinished: true });
  const active = courses.filter((c) => c.status === "active");
  const finished = courses.filter((c) => c.status !== "active");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/more" className="text-muted" aria-label="Back to others">‹ Others</Link>
        <h1 className="text-2xl font-bold">Courses</h1>
      </header>
      <AddCourseForm />
      {courses.length === 0 && <p className="text-sm text-muted">No courses yet. Add one above, or share the course outline with Paddie.</p>}
      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((c) => {
            const { total, solid, learning } = c.summary.topics;
            return (
              <li key={c.id}>
                <Link href={`/app/courses/${c.id}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{c.code ? `${c.code} · ${c.title}` : c.title}</span>
                    {c.targetGrade && <span className="shrink-0 text-xs text-muted">aim {c.targetGrade}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {total ? `${solid} solid · ${learning} learning · ${total - solid - learning} to start` : "No topics yet"}
                    {c.summary.next && ` · ${c.summary.next.title} ${c.summary.next.daysAway === 0 ? "today" : `in ${c.summary.next.daysAway}d`}`}
                  </p>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={solid} aria-label={`${solid} of ${total} topics solid`}>
                      <div className="h-full rounded-full bg-gold" style={{ width: `${(solid / total) * 100}%` }} />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-muted">Finished</h2>
          <ul className="flex flex-col gap-2">
            {finished.map((c) => (
              <li key={c.id}>
                <Link href={`/app/courses/${c.id}`} className="block rounded-2xl border border-line px-4 py-3 text-muted">{c.label} · {c.status}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
