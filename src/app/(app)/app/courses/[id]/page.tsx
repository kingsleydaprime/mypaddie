import Link from "next/link";
import { notFound } from "next/navigation";
import type { TopicStatus } from "@/features/courses/courses";
import { assessmentDoneAction, courseStatusAction, removeTopicAction, scoreAction } from "@/features/courses/courses.actions";
import { loadCourses, proposeStudy } from "@/features/courses/courses.repo";
import { AcceptStudy, AddAssessmentForm, AddTopicsForm } from "@/features/courses/ui/course-forms";
import { requireDb } from "@/shared/supabase/session";

const STATUS: Record<TopicStatus, { label: string; dot: string }> = {
  not_started: { label: "to start", dot: "border border-line" },
  learning: { label: "learning", dot: "bg-gold/40" },
  solid: { label: "solid", dot: "bg-gold" },
};
const WHY = { exam_prep: "exam prep", review: "review", new_topic: "new" } as const;
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function CoursePage({ params }: PageProps<"/app/courses/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/courses/${id}`);
  const now = new Date();
  const course = (await loadCourses(db, now, { course: id }))[0];
  if (!course) notFound();
  const plan = course.status === "active" ? await proposeStudy(db, now, { course: id }) : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/courses" className="text-muted" aria-label="Back to courses">‹ Courses</Link>
      </header>
      <section>
        <h1 className="text-2xl font-bold">{course.code ? `${course.code} · ${course.title}` : course.title}</h1>
        <p className="text-sm text-muted">
          {[course.lecturer, course.semester, course.units !== null ? `${course.units} units` : null, course.targetGrade ? `aiming for ${course.targetGrade}` : null].filter(Boolean).join(" · ")}
        </p>
        {course.description && <p className="mt-2 text-sm">{course.description}</p>}
      </section>

      {plan && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">Study plan, next 7 days</h2>
          {plan.sessions.length === 0 ? (
            <p className="text-sm text-muted">{course.topics.length ? "Nothing to add — you're booked or on top of it." : "Add topics and Paddie can plan your study."}</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {plan.sessions.map((s) => (
                <li key={`${s.day}-${s.topic}`} className="flex justify-between gap-3">
                  <span><span className="text-muted">{weekday(s.day)}</span> · {s.topic}</span>
                  <span className="shrink-0 text-muted">{s.minutes} min · {WHY[s.why]}{s.for ? ` for ${s.for}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.unplaced.length > 0 && (
            <p className="text-sm text-red" role="alert">
              No room before the exam for: {plan.unplaced.map((u) => u.topic).join(", ")}. Free some time or ask Paddie to shorten sessions.
            </p>
          )}
          {plan.sessions.length > 0 && (
            <AcceptStudy courseId={course.id} sessions={plan.sessions.map((s) => ({ courseId: s.courseId, topic: s.topic, day: s.day, minutes: s.minutes }))} />
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">
          Topics {course.summary.topics.total > 0 && <span className="text-sm font-normal text-muted">{course.summary.topics.solid}/{course.summary.topics.total} solid</span>}
        </h2>
        {course.topics.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {course.topics.map((t) => (
              <li key={t.title} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-3 w-3 shrink-0 rounded-full ${STATUS[t.status].dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.week ? <span className="text-muted">W{t.week} · </span> : null}{t.title}</p>
                  <p className="text-xs text-muted">
                    {STATUS[t.status].label}
                    {t.confidence !== null ? ` · confidence ${t.confidence}/5` : ""}
                    {t.minutes ? ` · ${t.minutes} min` : ""}
                    {t.reviewDue ? " · review due" : ""}
                  </p>
                </div>
                <form action={removeTopicAction.bind(null, course.id, t.title)}>
                  <button className="text-xs text-muted" aria-label={`Remove ${t.title}`}>✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddTopicsForm courseId={course.id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Tests, exams and assignments</h2>
        {course.assessments.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {course.assessments.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-medium ${a.done ? "text-muted line-through" : ""}`}>{a.title} <span className="text-xs text-muted">{a.kind}</span></span>
                  <span className="shrink-0 text-sm text-muted">{a.day ? `${weekday(a.day)}${a.time && a.time !== "23:59" ? ` ${a.time}` : ""}` : "date TBA"}</span>
                </div>
                <p className="text-xs text-muted">
                  {[a.weight_pct !== null ? `${a.weight_pct}% of grade` : null, a.topics.length ? `covers ${a.topics.join(", ")}` : null].filter(Boolean).join(" · ")}
                </p>
                <div className="flex items-center gap-3">
                  <form action={assessmentDoneAction.bind(null, course.id, a.title, !a.done)}>
                    <button className="rounded-lg border border-line px-2.5 py-1 text-sm" aria-pressed={a.done}>{a.done ? "Undo done" : "Mark done"}</button>
                  </form>
                  <form action={scoreAction.bind(null, course.id, a.title)} className="flex flex-1 gap-2">
                    <input name="score" defaultValue={a.score ?? ""} placeholder="Score" maxLength={50} className="w-24 rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm" aria-label={`Score for ${a.title}`} />
                    <button className="text-sm font-semibold text-gold">Save</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <AddAssessmentForm courseId={course.id} topics={course.topics.map((t) => t.title)} />
      </section>

      <section className="flex flex-wrap gap-2">
        {(["active", "done", "dropped"] as const).map((s) => (
          <form key={s} action={courseStatusAction.bind(null, course.id, s)}>
            <button aria-pressed={course.status === s} className={`rounded-full border px-3 py-1.5 text-sm ${course.status === s ? "border-gold bg-gold text-on-gold" : "border-line text-muted"}`}>{s}</button>
          </form>
        ))}
      </section>
    </div>
  );
}
