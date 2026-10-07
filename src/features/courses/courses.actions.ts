"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { ASSESSMENT_KINDS, parseTopics, type AssessmentKind } from "./courses";
import { acceptStudy, addCourse, changeAssessment, updateCourse, type StudyBooking } from "./courses.repo";

export type CourseFormState = null | { ok: true; message?: string } | { error: string };

const text = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export async function addCourseAction(_prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const title = text(form, "title");
  if (!title) return { error: "Give the course a title" };
  const units = text(form, "units") ? Number(text(form, "units")) : null;
  if (units !== null && (!Number.isInteger(units) || units < 0 || units > 30)) return { error: "Units is a whole number up to 30" };
  const db = await requireDb("/app/courses");
  const result = await addCourse(
    db,
    {
      code: text(form, "code") || null,
      title,
      lecturer: text(form, "lecturer") || null,
      semester: text(form, "semester") || null,
      units,
      targetGrade: text(form, "targetGrade") || null,
      topics: parseTopics(text(form, "topics")),
    },
    new Date(),
  );
  if (result.result === "exists") return { error: `You already have ${result.course}` };
  revalidatePath("/app/courses");
  redirect(`/app/courses/${result.id}`);
}

export async function addTopicsAction(courseId: string, _prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const topics = parseTopics(text(form, "topics"));
  if (topics.length === 0) return { error: "Paste or type at least one topic" };
  const db = await requireDb(`/app/courses/${courseId}`);
  const result = await updateCourse(db, courseId, { addTopics: topics }, new Date());
  if (result.result === "not_found") return { error: "Course not found" };
  revalidatePath(`/app/courses/${courseId}`);
  const skipped = result.topicsSkipped?.length ? ` (${result.topicsSkipped.length} already there)` : "";
  return { ok: true, message: `Added ${result.topicsAdded ?? 0}${skipped}.` };
}

export async function removeTopicAction(courseId: string, title: string) {
  const db = await requireDb(`/app/courses/${courseId}`);
  await updateCourse(db, courseId, { removeTopics: [title] }, new Date());
  revalidatePath(`/app/courses/${courseId}`);
}

export async function addAssessmentAction(courseId: string, _prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const kind = text(form, "kind") as AssessmentKind;
  const title = text(form, "title");
  if (!ASSESSMENT_KINDS.includes(kind)) return { error: "Pick a kind" };
  if (!title) return { error: "Name it, e.g. Midterm or Assignment 2" };
  const minutes = text(form, "minutes") ? Number(text(form, "minutes")) : undefined;
  const weight = text(form, "weight") ? Number(text(form, "weight")) : null;
  if (weight !== null && (!Number.isInteger(weight) || weight < 0 || weight > 100)) return { error: "Weight is 0–100%" };
  const db = await requireDb(`/app/courses/${courseId}`);
  const result = await changeAssessment(
    db,
    courseId,
    {
      add: {
        kind,
        title,
        date: text(form, "date") || undefined,
        time: text(form, "time") || undefined,
        minutes,
        weightPct: weight,
        topics: text(form, "topics").split(",").map((t) => t.trim()).filter(Boolean),
      },
    },
    new Date(),
  );
  if (result.result === "not_found") return { error: "Course not found" };
  revalidatePath(`/app/courses/${courseId}`);
  revalidatePath("/app");
  const sched = "scheduling" in result ? (result.scheduling as { result?: string } | undefined) : undefined;
  if (sched?.result === "over_capacity") return { ok: true, message: "Saved, but its day is full, so no task was made. Ask Paddie to fit it in." };
  return { ok: true, message: "Saved." };
}

export async function assessmentDoneAction(courseId: string, title: string, done: boolean) {
  const db = await requireDb(`/app/courses/${courseId}`);
  await changeAssessment(db, courseId, { assessment: title, done }, new Date());
  revalidatePath(`/app/courses/${courseId}`);
  revalidatePath("/app");
}

export async function scoreAction(courseId: string, title: string, form: FormData) {
  const db = await requireDb(`/app/courses/${courseId}`);
  await changeAssessment(db, courseId, { assessment: title, score: text(form, "score") || null }, new Date());
  revalidatePath(`/app/courses/${courseId}`);
}

export async function acceptStudyAction(courseId: string | null, sessions: StudyBooking[]) {
  const db = await requireDb(courseId ? `/app/courses/${courseId}` : "/app/courses");
  const result = await acceptStudy(db, sessions, new Date());
  revalidatePath("/app");
  revalidatePath("/app/courses");
  if (courseId) revalidatePath(`/app/courses/${courseId}`);
  return result.booked;
}

export async function courseStatusAction(courseId: string, status: "active" | "done" | "dropped") {
  const db = await requireDb(`/app/courses/${courseId}`);
  await updateCourse(db, courseId, { status }, new Date());
  revalidatePath(`/app/courses/${courseId}`);
  revalidatePath("/app/courses");
}
