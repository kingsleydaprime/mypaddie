import { addEvent } from "@/features/events/add-event";
import { PlanLimitError } from "@/features/plans/plans";
import { requireFeature, requireRoom, requireRoomFor } from "@/features/plans/guard";
import { findOrCreateSkill, loadLearning } from "@/features/learning/learning.repo";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { roomOn } from "@/features/tasks/capacity";
import { completeTask, createTask, deleteTask, loadCapacity, loadDayTasks, updateTask, type CreateResult } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { parseRecurrence, withUntil } from "@/features/tasks/recurrence";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import {
  ASSIGNMENT_WEIGHTS,
  CLASS_BASE_XP,
  CLASS_WEIGHTS,
  classMinutes,
  classMinutesByWeekday,
  firstOn,
  WEEKDAY_CODES,
  type ClassKind,
  type WeekdayCode,
  isSitting,
  planStudy,
  plannedKey,
  STUDY_WEIGHTS,
  summarizeCourse,
  topicProgress,
  type AssessmentForPlan,
  type AssessmentKind,
  type CourseForPlan,
  type StudySession,
} from "./courses";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const COLUMNS =
  "id, skill_id, code, title, description, semester, lecturer, units, target_grade, status, " +
  "course_topics(id, title, notes, week, position), " +
  "course_assessments(id, kind, title, due_at, weight_pct, topics, score, done, event_id, task_id)";

/** Assignment tasks turn must-do this many days before they're due. */
const MUST_DO_DAYS_BEFORE_DUE = 2;

type CourseRow = {
  id: string;
  skill_id: string;
  code: string | null;
  title: string;
  description: string | null;
  semester: string | null;
  lecturer: string | null;
  units: number | null;
  target_grade: string | null;
  status: "active" | "done" | "dropped";
  course_topics: { id: string; title: string; notes: string | null; week: number | null; position: number }[];
  course_assessments: {
    id: string; kind: AssessmentKind; title: string; due_at: string | null; weight_pct: number | null;
    topics: string[]; score: string | null; done: boolean; event_id: string | null; task_id: string | null;
  }[];
};

export const courseLabel = (c: { code: string | null; title: string }) => c.code?.trim() || c.title.trim();

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Every course (or one, by id, code or title) with each topic's progress and what's coming up. */
export async function loadCourses(db: Db, now: Date, opts: { course?: string; includeFinished?: boolean } = {}) {
  let query = db.from("courses").select(COLUMNS).order("created_at");
  const ref = opts.course?.trim().toLowerCase();
  if (ref && isUuid(ref)) query = query.eq("id", ref);
  else if (!ref && !opts.includeFinished) query = query.eq("status", "active");
  const { data: rows, error } = await query.returns<CourseRow[]>();
  if (error) throw new Error(`loading courses: ${error.message}`);
  // By code or title, case-insensitively ("mth 201" finds "MTH 201"). Matched here: a handful of rows.
  const data = ref && !isUuid(ref) ? rows.filter((c) => c.code?.trim().toLowerCase() === ref || c.title.trim().toLowerCase() === ref) : rows;
  if (data.length === 0) return [];

  const learning = await loadLearning(db, now);
  const today = dayKey(now, tz());
  return data.map((c) => {
    const practised = learning.find((l) => l.skill.id === c.skill_id)?.summary.topics ?? [];
    const topics = topicProgress(c.course_topics, practised);
    const assessments = [...c.course_assessments]
      .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))
      .map((a) => ({ ...a, day: a.due_at ? dayKey(new Date(a.due_at), tz()) : null, time: a.due_at ? localTimeOf(new Date(a.due_at), tz()) : null }));
    return {
      id: c.id,
      skillId: c.skill_id,
      label: courseLabel(c),
      code: c.code,
      title: c.title,
      description: c.description,
      semester: c.semester,
      lecturer: c.lecturer,
      units: c.units,
      targetGrade: c.target_grade,
      status: c.status,
      topics,
      topicIds: Object.fromEntries(c.course_topics.map((t) => [t.title.toLowerCase(), t.id])),
      topicNotes: Object.fromEntries(c.course_topics.map((t) => [t.title.toLowerCase(), t.notes])),
      assessments,
      summary: summarizeCourse(topics, assessments.map(toPlanAssessment), today),
    };
  });
}

export type LoadedCourse = Awaited<ReturnType<typeof loadCourses>>[number];

const toPlanAssessment = (a: { title: string; kind: AssessmentKind; day: string | null; topics: string[]; done: boolean }): AssessmentForPlan => ({
  title: a.title,
  kind: a.kind,
  day: a.day,
  topics: a.topics,
  done: a.done,
});

async function findCourse(db: Db, ref: string, now: Date): Promise<LoadedCourse | null> {
  const found = await loadCourses(db, now, { course: ref });
  return found.length === 1 ? found[0]! : null;
}

export interface TopicInput {
  title: string;
  notes?: string | null;
  week?: number | null;
}

export interface AssessmentInput {
  kind: AssessmentKind;
  title: string;
  /** Local date; omit if not announced yet. */
  date?: string;
  /** Local "HH:MM"; for an exam, when it starts. */
  time?: string;
  /** How long it is (exams) or roughly how long the work takes (assignments). */
  minutes?: number;
  weightPct?: number | null;
  topics?: string[];
}

export interface NewCourse {
  code?: string | null;
  title: string;
  description?: string | null;
  semester?: string | null;
  lecturer?: string | null;
  units?: number | null;
  targetGrade?: string | null;
  topics?: TopicInput[];
  assessments?: AssessmentInput[];
}

/**
 * A course, its academic skill (study time and topic confidence live there),
 * its syllabus and its assessments. Pasting an outline lands here in one call.
 */
export async function addCourse(db: Db, input: NewCourse, now: Date) {
  await requireRoom(db, "courses");
  const label = courseLabel({ code: input.code ?? null, title: input.title });
  const { skill } = await findOrCreateSkill(db, label, "academic");
  const { data: course, error } = await db
    .from("courses")
    .insert({
      skill_id: skill.id,
      code: input.code?.trim() || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      semester: input.semester?.trim() || null,
      lecturer: input.lecturer?.trim() || null,
      units: input.units ?? null,
      target_grade: input.targetGrade?.trim() || null,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { result: "exists" as const, course: label };
  if (error) throw new Error(`saving the course: ${error.message}`);
  // A skill made under the old default pillar is moved to academic: it's coursework.
  if (skill.pillar !== "academic") await db.from("skills").update({ pillar: "academic" }).eq("id", skill.id);

  const topics = await addTopics(db, course.id, input.topics ?? [], 0);
  const assessments = [];
  for (const a of input.assessments ?? []) assessments.push(await addAssessment(db, { id: course.id, label }, a, now));
  return { result: "added" as const, id: course.id, course: label, topicsAdded: topics.added, topicsSkipped: topics.skipped, assessments };
}

async function addTopics(db: Db, courseId: string, topics: TopicInput[], startPosition: number) {
  const seen = new Set<string>();
  const rows = topics
    .map((t) => ({ ...t, title: t.title.trim() }))
    .filter((t) => t.title && !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()))
    .map((t, i) => ({ course_id: courseId, title: t.title, notes: t.notes?.trim() || null, week: t.week ?? null, position: startPosition + i }));
  if (rows.length === 0) return { added: 0, skipped: [] as string[] };
  const { data: existing } = await db.from("course_topics").select("title").eq("course_id", courseId);
  const have = new Set((existing ?? []).map((t) => t.title.toLowerCase()));
  const fresh = rows.filter((r) => !have.has(r.title.toLowerCase()));
  if (fresh.length) {
    const { error } = await db.from("course_topics").insert(fresh);
    if (error) throw new Error(`saving topics: ${error.message}`);
  }
  return { added: fresh.length, skipped: rows.filter((r) => have.has(r.title.toLowerCase())).map((r) => r.title) };
}

/** The event (sat in person) or task (handed in) that carries a dated assessment. */
async function scheduleAssessment(db: Db, course: { label: string }, a: AssessmentInput, now: Date) {
  if (!a.date) return { eventId: null, taskId: null, scheduling: null };
  const title = `${course.label} ${a.title}`;
  if (isSitting(a.kind)) {
    const end = a.time && a.minutes ? localTimeOf(new Date(zonedInstant(a.date, a.time, tz()).getTime() + a.minutes * 60_000), tz()) : undefined;
    const made = await addEvent(db, { title, kind: "exam", date: a.date, start_time: a.time, end_time: end, important: true }, now);
    if ("error" in made) return { eventId: null, taskId: null, scheduling: { result: "not_scheduled", reason: made.error } };
    return { eventId: made.event.id, taskId: null, scheduling: { result: "event", clashes: made.clashes } };
  }
  const today = dayKey(now, tz());
  const mustDay = addDays(a.date, -MUST_DO_DAYS_BEFORE_DUE);
  const task: CreateResult = await createTask(
    db,
    {
      title,
      itemId: null,
      baseXp: 20,
      dueDate: a.date < today ? today : a.date,
      dueTime: null,
      recurrence: null,
      nonNegotiable: false,
      weights: ASSIGNMENT_WEIGHTS,
      durationMinutes: a.minutes ?? 120,
      mustFrom: zonedInstant(mustDay < today ? today : mustDay, "09:00", tz()),
    },
    now,
  );
  return task.result === "created"
    ? { eventId: null, taskId: task.task.id, scheduling: { result: "task" } }
    : { eventId: null, taskId: null, scheduling: task };
}

export async function addAssessment(db: Db, course: { id: string; label: string }, a: AssessmentInput, now: Date) {
  const dueAt = a.date ? zonedInstant(a.date, a.time ?? "23:59", tz()) : null;
  const linked = await scheduleAssessment(db, course, a, now);
  const { error } = await db.from("course_assessments").insert({
    course_id: course.id,
    kind: a.kind,
    title: a.title.trim(),
    due_at: dueAt?.toISOString() ?? null,
    weight_pct: a.weightPct ?? null,
    topics: (a.topics ?? []).map((t) => t.trim()).filter(Boolean),
    event_id: linked.eventId,
    task_id: linked.taskId,
  });
  if (error) throw new Error(`saving "${a.title}": ${error.message}`);
  return { assessment: a.title, ...(linked.scheduling ? { scheduling: linked.scheduling } : {}) };
}

/** Drops the event/task behind an assessment (it moved or was removed). Done work stays on the record. */
async function unschedule(db: Db, a: { event_id: string | null; task_id: string | null }, now: Date) {
  if (a.event_id) await db.from("events").delete().eq("id", a.event_id);
  if (a.task_id) {
    const d = await deleteTask(db, a.task_id);
    if (d.result === "has_history") await updateTask(db, a.task_id, {}, "cancel", now);
  }
}

export interface CourseChanges {
  code?: string | null;
  title?: string;
  description?: string | null;
  semester?: string | null;
  lecturer?: string | null;
  units?: number | null;
  targetGrade?: string | null;
  status?: "active" | "done" | "dropped";
  addTopics?: TopicInput[];
  removeTopics?: string[];
}

export async function updateCourse(db: Db, ref: string, changes: CourseChanges, now: Date) {
  const course = await findCourse(db, ref, now);
  if (!course) return { result: "not_found" as const };
  const { error } = await db
    .from("courses")
    .update({
      ...(changes.code !== undefined ? { code: changes.code?.trim() || null } : {}),
      ...(changes.title ? { title: changes.title.trim() } : {}),
      ...(changes.description !== undefined ? { description: changes.description?.trim() || null } : {}),
      ...(changes.semester !== undefined ? { semester: changes.semester?.trim() || null } : {}),
      ...(changes.lecturer !== undefined ? { lecturer: changes.lecturer?.trim() || null } : {}),
      ...(changes.units !== undefined ? { units: changes.units } : {}),
      ...(changes.targetGrade !== undefined ? { target_grade: changes.targetGrade?.trim() || null } : {}),
      ...(changes.status ? { status: changes.status } : {}),
    })
    .eq("id", course.id);
  if (error) throw new Error(`updating the course: ${error.message}`);

  // Finished or dropped: open study tasks for it are moot; its skill stops showing reviews.
  if (changes.status && changes.status !== "active") {
    const { data: open } = await db.from("tasks").select("id").eq("skill_id", course.skillId).eq("status", "pending");
    for (const t of open ?? []) await updateTask(db, t.id, {}, "cancel", now);
    await db.from("skills").update({ status: changes.status === "done" ? "done" : "paused" }).eq("id", course.skillId);
  } else if (changes.status === "active") {
    await db.from("skills").update({ status: "active" }).eq("id", course.skillId);
  }

  const topics = changes.addTopics?.length ? await addTopics(db, course.id, changes.addTopics, course.topics.length) : null;
  const removed: string[] = [];
  for (const title of changes.removeTopics ?? []) {
    const id = course.topicIds[title.trim().toLowerCase()];
    if (id) {
      await db.from("course_topics").delete().eq("id", id);
      removed.push(title.trim());
    }
  }
  return {
    result: "updated" as const,
    course: courseLabel({ code: changes.code === undefined ? course.code : changes.code, title: changes.title ?? course.title }),
    ...(topics ? { topicsAdded: topics.added, topicsSkipped: topics.skipped } : {}),
    ...(changes.removeTopics ? { topicsRemoved: removed } : {}),
  };
}

export interface AssessmentChanges {
  add?: AssessmentInput;
  /** Which one to change (by title). */
  assessment?: string;
  done?: boolean;
  score?: string | null;
  weightPct?: number | null;
  topics?: string[];
  /** A new date (and time); moves its event or task. null = not dated any more. */
  date?: { date: string; time?: string; minutes?: number } | null;
  remove?: boolean;
}

export async function changeAssessment(db: Db, ref: string, changes: AssessmentChanges, now: Date) {
  const course = await findCourse(db, ref, now);
  if (!course) return { result: "not_found" as const };
  if (changes.add) return { result: "added" as const, ...(await addAssessment(db, { id: course.id, label: course.label }, changes.add, now)) };

  const a = course.assessments.find((x) => x.title.trim().toLowerCase() === changes.assessment?.trim().toLowerCase());
  if (!a) return { result: "no_such_assessment" as const, assessments: course.assessments.map((x) => x.title) };

  if (changes.remove) {
    if (!a.done) await unschedule(db, a, now);
    await db.from("course_assessments").delete().eq("id", a.id);
    return { result: "removed" as const, assessment: a.title };
  }

  let completed = null;
  if (changes.done === true && !a.done && a.task_id) completed = await completeTask(db, a.task_id, now); // handing it in pays XP

  let moved = null;
  let linked: { event_id: string | null; task_id: string | null } = { event_id: a.event_id, task_id: a.task_id };
  let dueAt: string | null | undefined;
  if (changes.date !== undefined && !a.done) {
    await unschedule(db, a, now);
    dueAt = changes.date ? zonedInstant(changes.date.date, changes.date.time ?? "23:59", tz()).toISOString() : null;
    const made = changes.date
      ? await scheduleAssessment(db, { label: course.label }, { kind: a.kind, title: a.title, date: changes.date.date, time: changes.date.time, minutes: changes.date.minutes }, now)
      : { eventId: null, taskId: null, scheduling: null };
    linked = { event_id: made.eventId, task_id: made.taskId };
    moved = made.scheduling;
  }

  const { error } = await db
    .from("course_assessments")
    .update({
      ...(changes.done !== undefined ? { done: changes.done } : {}),
      ...(changes.score !== undefined ? { score: changes.score?.trim() || null } : {}),
      ...(changes.weightPct !== undefined ? { weight_pct: changes.weightPct } : {}),
      ...(changes.topics ? { topics: changes.topics.map((t) => t.trim()).filter(Boolean) } : {}),
      ...(dueAt !== undefined ? { due_at: dueAt, ...linked } : {}),
    })
    .eq("id", a.id);
  if (error) throw new Error(`updating "${a.title}": ${error.message}`);
  return { result: "updated" as const, assessment: a.title, ...(completed ? { completed } : {}), ...(moved ? { scheduling: moved } : {}) };
}

/**
 * Proposes study sessions from the syllabus, exams and review dates, fitted
 * into each day's free capacity. Nothing is booked until accepted.
 */
export async function proposeStudy(db: Db, now: Date, opts: { course?: string; days?: number; sessionMinutes?: number; maxPerDay?: number } = {}) {
  requireFeature("studyPlans");
  const courses = (await loadCourses(db, now, { course: opts.course })).filter((c) => c.status === "active");
  const today = dayKey(now, tz());
  const days = opts.days ?? 7;

  const [capacity, schedule] = await Promise.all([loadCapacity(db), loadSchedule(db)]);
  const room: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    room[day] = roomOn(day, await loadDayTasks(db, day), capacity, now, undefined, dayEndsAt(schedule)).available;
  }

  // Topics already booked as open study tasks aren't booked twice.
  const skillToCourse = new Map(courses.map((c) => [c.skillId, c.id]));
  const { data: open } = skillToCourse.size
    ? await db.from("tasks").select("skill_id, topic").eq("status", "pending").in("skill_id", [...skillToCourse.keys()]).not("topic", "is", null)
    : { data: [] as { skill_id: string | null; topic: string | null }[] };
  const alreadyPlanned = new Set((open ?? []).map((t) => plannedKey(skillToCourse.get(t.skill_id!)!, t.topic!)));

  const forPlan: CourseForPlan[] = courses.map((c) => ({
    id: c.id,
    label: c.label,
    skillId: c.skillId,
    topics: c.topics,
    assessments: c.assessments.map(toPlanAssessment),
  }));
  const plan = planStudy({ today, courses: forPlan, days, sessionMinutes: opts.sessionMinutes, maxPerDay: opts.maxPerDay, room, alreadyPlanned });
  return { ...plan, courses: courses.length, room };
}

export type StudyBooking = Pick<StudySession, "courseId" | "topic" | "day" | "minutes"> & { time?: string };

/** Books accepted study sessions as tasks: linked to the course's skill and topic, so doing one records the practice. */
export async function acceptStudy(db: Db, sessions: StudyBooking[], now: Date) {
  requireFeature("studyPlans");
  const courses = await loadCourses(db, now, { includeFinished: true });
  const results = [];
  for (const s of sessions) {
    const course = courses.find((c) => c.id === s.courseId);
    if (!course) {
      results.push({ topic: s.topic, day: s.day, result: "no_such_course" as const });
      continue;
    }
    const made = await createTask(
      db,
      {
        title: `${course.label}: ${s.topic}`,
        itemId: null,
        baseXp: 10,
        dueDate: s.day,
        dueTime: s.time ?? null,
        recurrence: null,
        nonNegotiable: false,
        weights: STUDY_WEIGHTS,
        durationMinutes: s.minutes,
        skillId: course.skillId,
        topic: s.topic,
      },
      now,
    );
    results.push(made.result === "created" ? { topic: s.topic, day: s.day, result: "booked" as const, taskId: made.task.id } : { topic: s.topic, day: s.day, ...made });
  }
  return { booked: results.filter((r) => r.result === "booked").length, results };
}

// ─── Timetable ──────────────────────────────────────────────────────────────

export interface ClassInput {
  /** Code or title; a course that doesn't exist yet is created. */
  course: string;
  kind: ClassKind;
  days: WeekdayCode[];
  start: string;
  end: string;
  venue?: string | null;
}

export interface LoadedClass {
  seriesId: string;
  title: string;
  kind: string;
  days: WeekdayCode[];
  start: string | null;
  minutes: number | null;
  venue: string | null;
  until: string | null;
}

/** A course's classes: its repeating time blocks (latest row of each series). */
export async function loadClasses(db: Db, courseId: string): Promise<LoadedClass[]> {
  const { data, error } = await db
    .from("tasks")
    .select("series_id, title, recurrence, due_at, duration_minutes, location, occurs_on")
    .eq("course_id", courseId)
    .not("recurrence", "is", null)
    .order("occurs_on", { ascending: false });
  if (error) throw new Error(`loading classes: ${error.message}`);
  const seen = new Set<string>();
  const out: LoadedClass[] = [];
  for (const r of data) {
    if (!r.series_id || seen.has(r.series_id)) continue;
    seen.add(r.series_id);
    const rule = parseRecurrence(r.recurrence!);
    const days = rule.freq === "daily" ? [...WEEKDAY_CODES] : WEEKDAY_CODES.filter((_, i) => rule.days.has(i));
    out.push({
      seriesId: r.series_id,
      title: r.title,
      kind: r.title.split(" ").pop()!.toLowerCase(),
      days,
      start: r.due_at ? localTimeOf(new Date(r.due_at), tz()) : null,
      minutes: r.duration_minutes,
      venue: r.location,
      until: rule.until ?? null,
    });
  }
  const order = (c: LoadedClass) => Math.min(...c.days.map((d) => (WEEKDAY_CODES.indexOf(d) + 6) % 7));
  return out.sort((a, b) => order(a) - order(b) || (a.start ?? "").localeCompare(b.start ?? ""));
}

const KIND_TITLE: Record<ClassKind, string> = { lecture: "Lecture", tutorial: "Tutorial", lab: "Lab", seminar: "Seminar", practical: "Practical", other: "Class" };

/**
 * Sets the timetable for the courses mentioned: their existing classes are
 * replaced (stopped, history kept), each class becomes a weekly block from
 * `from` (default today) until the semester ends. Classes are fixed — never
 * refused for a full day — so the result names any weekday whose classes
 * alone pass the day's capacity.
 */
export async function setTimetable(db: Db, input: { classes: ClassInput[]; from?: string; until?: string | null }, now: Date) {
  const today = dayKey(now, tz());
  const from = input.from && input.from > today ? input.from : today;
  const until = input.until ?? null;
  if (until && until < from) return { result: "bad_dates" as const, message: "The semester can't end before the classes start." };

  const byCourse = new Map<string, ClassInput[]>();
  for (const c of input.classes) byCourse.set(c.course.trim(), [...(byCourse.get(c.course.trim()) ?? []), c]);

  // All or nothing: make sure the plan has room for every course this would create, before touching anything.
  const missing = [];
  for (const ref of byCourse.keys()) if (!(await loadCourses(db, now, { course: ref }))[0]) missing.push(ref);
  try {
    await requireRoomFor(db, "courses", missing.length);
  } catch (e) {
    if (e instanceof PlanLimitError) return { result: "plan_limit" as const, message: `${e.message} New courses in this timetable: ${missing.join(", ")}.`, nothingChanged: true };
    throw e;
  }

  const results = [];
  for (const [ref, classes] of byCourse) {
    let course = (await loadCourses(db, now, { course: ref }))[0];
    let created = false;
    if (!course) {
      const looksLikeCode = /^[A-Za-z]{2,5}\s?\d{2,4}[A-Za-z]?$/.test(ref);
      const made = await addCourse(db, looksLikeCode ? { code: ref.toUpperCase(), title: ref.toUpperCase() } : { title: ref }, now);
      if (made.result !== "added") throw new Error(`couldn't create the course "${ref}"`);
      course = (await loadCourses(db, now, { course: made.id }))[0]!;
      created = true;
    }
    // Replace: stop this course's current classes (past days stay as history).
    for (const old of await loadClasses(db, course.id)) {
      const { data: row } = await db.from("tasks").select("id").eq("series_id", old.seriesId).order("occurs_on", { ascending: false }).limit(1).maybeSingle();
      if (row) await updateTask(db, row.id, {}, "stop", now);
    }
    await db.from("courses").update({ semester_start: from, ...(until ? { semester_end: until } : {}) }).eq("id", course.id);

    for (const c of classes) {
      const minutes = classMinutes(c.start, c.end);
      const made = await createTask(
        db,
        {
          title: `${course.label} ${KIND_TITLE[c.kind]}`,
          itemId: null,
          baseXp: CLASS_BASE_XP,
          dueDate: firstOn(from, c.days),
          dueTime: c.start,
          recurrence: withUntil(`FREQ=WEEKLY;BYDAY=${c.days.join(",")}`, until),
          nonNegotiable: false,
          weights: CLASS_WEIGHTS,
          durationMinutes: minutes,
          courseId: course.id,
          location: c.venue ?? null,
          fixed: true,
        },
        now,
      );
      results.push({ course: course.label, created, class: `${KIND_TITLE[c.kind]} ${c.days.join("/")} ${c.start}–${c.end}`, result: made.result });
    }
  }

  // Which weekdays are already over capacity from classes alone?
  const capacity = await loadCapacity(db);
  const everyClass = (
    await Promise.all((await loadCourses(db, now)).map((c) => loadClasses(db, c.id)))
  ).flat().filter((c) => c.minutes !== null && (!c.until || c.until >= today));
  const perDay = classMinutesByWeekday(everyClass.map((c) => ({ days: c.days, minutes: c.minutes! })));
  const overloaded = WEEKDAY_CODES.filter((d) => perDay[d] > capacity.defaultMinutes).map((d) => ({ day: d, classHours: perDay[d] / 60, capacityHours: capacity.defaultMinutes / 60 }));
  return { result: "set" as const, from, until, classes: results, ...(overloaded.length ? { overloaded } : {}) };
}
