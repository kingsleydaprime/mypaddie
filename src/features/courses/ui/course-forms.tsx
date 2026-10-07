"use client";

import { useActionState, useState, useTransition } from "react";
import { ASSESSMENT_KINDS } from "../courses";
import { acceptStudyAction, addAssessmentAction, addCourseAction, addTopicsAction, type CourseFormState } from "../courses.actions";
import type { StudyBooking } from "../courses.repo";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const button = "rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60";

function Status({ state }: { state: CourseFormState }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-red" role="alert">{state.error}</p>;
  return state.message ? <p className="text-sm text-muted" role="status">{state.message}</p> : null;
}

const TOPICS_HINT = "Topics, one per line (paste from the outline)\nWeek 1: Limits\nWeek 2: Derivatives\nIntegrals";

export function AddCourseForm() {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(addCourseAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null}>
      <summary className="cursor-pointer font-bold">+ Add course</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <input name="code" maxLength={20} placeholder="Code" className={field} aria-label="Course code, e.g. MTH 201" />
          <input name="title" required maxLength={200} placeholder="Title, e.g. Calculus II" className={`${field} col-span-2`} aria-label="Course title" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="lecturer" placeholder="Lecturer" className={field} aria-label="Lecturer" />
          <input name="semester" placeholder="Semester" className={field} aria-label="Semester" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="units" type="number" min={0} max={30} placeholder="Units" className={field} aria-label="Units" />
          <input name="targetGrade" placeholder="Target grade" className={field} aria-label="Target grade" />
        </div>
        <textarea name="topics" rows={4} placeholder={TOPICS_HINT} className={field} aria-label="Topics" />
        <p className="text-xs text-muted">Have the outline as a PDF? Share it with Paddie in chat and it&apos;ll fill in the topics, tests and exams for you.</p>
        <Status state={state} />
        <button disabled={pending} className={button}>{pending ? "Adding…" : "Add course"}</button>
      </form>
    </details>
  );
}

export function AddTopicsForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(addTopicsAction.bind(null, courseId), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <textarea name="topics" rows={3} placeholder={TOPICS_HINT} className={field} aria-label="Topics to add" />
      <Status state={state} />
      <button disabled={pending} className="self-start rounded-xl border border-gold px-3 py-2 text-sm font-semibold text-gold disabled:opacity-60">
        {pending ? "Adding…" : "Add topics"}
      </button>
    </form>
  );
}

export function AddAssessmentForm({ courseId, topics }: { courseId: string; topics: string[] }) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(addAssessmentAction.bind(null, courseId), null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">+ Add test, exam or assignment</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" defaultValue="test" className={field} aria-label="Kind">
            {ASSESSMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input name="title" required maxLength={200} placeholder="e.g. Midterm" className={field} aria-label="Name" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="date" type="date" className={field} aria-label="Date (leave empty if not announced)" />
          <input name="time" type="time" className={field} aria-label="Start time (exams) or due time (assignments)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="minutes" type="number" min={5} max={1440} placeholder="Minutes" className={field} aria-label="Exam length or work time in minutes" />
          <input name="weight" type="number" min={0} max={100} placeholder="Weight %" className={field} aria-label="Weight in percent" />
        </div>
        <input name="topics" list={`topics-${courseId}`} placeholder="Topics it covers, comma-separated (empty = everything)" className={field} aria-label="Topics it covers" />
        <datalist id={`topics-${courseId}`}>{topics.map((t) => <option key={t} value={t} />)}</datalist>
        <p className="text-xs text-muted">Exams, tests and quizzes go on your calendar as events. Assignments become tasks that turn must-do 2 days before.</p>
        <Status state={state} />
        <button disabled={pending} className={button}>{pending ? "Saving…" : "Save"}</button>
      </form>
    </details>
  );
}

export function AcceptStudy({ courseId, sessions }: { courseId: string | null; sessions: StudyBooking[] }) {
  const [pending, start] = useTransition();
  const [booked, setBooked] = useState<number | null>(null);
  if (booked !== null) {
    return <p className="font-semibold" role="status">Booked {booked} of {sessions.length}. They&apos;re on Today when their day comes.</p>;
  }
  return (
    <button
      type="button"
      disabled={pending || sessions.length === 0}
      onClick={() => start(async () => setBooked(await acceptStudyAction(courseId, sessions)))}
      className={button}
    >
      {pending ? "Booking…" : "Book these sessions"}
    </button>
  );
}
