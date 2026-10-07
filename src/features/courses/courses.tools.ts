import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { ASSESSMENT_KINDS, type AssessmentKind } from "./courses";
import {
  acceptStudy,
  addCourse,
  changeAssessment,
  loadCourses,
  proposeStudy,
  updateCourse,
  type AssessmentInput,
  type LoadedCourse,
  type TopicInput,
} from "./courses.repo";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const topic = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(1000).optional().describe("Subtopics, what the outline says about it"),
  week: z.number().int().min(1).max(30).optional(),
});
const assessment = z.object({
  kind: z.enum(ASSESSMENT_KINDS),
  title: z.string().trim().min(1).max(200).describe("e.g. 'Midterm', 'Assignment 2', 'Quiz 1'"),
  date: z.iso.date().optional().describe("Omit if not announced yet"),
  time: time.optional().describe("Start time for exams/tests; due time for assignments (default 23:59)"),
  minutes: z.number().int().min(5).max(1440).optional().describe("Exam length, or roughly how long the work takes"),
  weight_pct: z.number().int().min(0).max(100).optional().describe("Share of the final grade"),
  topics: z.array(z.string().trim().min(1)).optional().describe("Topic titles it covers; omit = everything so far"),
});
type AssessmentArg = z.infer<typeof assessment>;
const toAssessment = (a: AssessmentArg): AssessmentInput => ({
  kind: a.kind as AssessmentKind, title: a.title, date: a.date, time: a.time, minutes: a.minutes, weightPct: a.weight_pct, topics: a.topics,
});

const view = (c: LoadedCourse, detail: boolean) => ({
  id: c.id,
  course: c.label,
  title: c.title,
  status: c.status,
  targetGrade: c.targetGrade,
  progress: c.summary.topics,
  next: c.summary.next,
  ...(detail
    ? {
        code: c.code,
        description: c.description,
        semester: c.semester,
        lecturer: c.lecturer,
        units: c.units,
        topics: c.topics.map((t) => ({
          title: t.title,
          week: t.week,
          status: t.status,
          confidence: t.confidence,
          minutes: t.minutes,
          reviewDue: t.reviewDue,
          notes: c.topicNotes[t.title.toLowerCase()] ?? null,
        })),
        assessments: c.assessments.map((a) => ({
          title: a.title, kind: a.kind, day: a.day, time: a.time, weightPct: a.weight_pct, topics: a.topics, done: a.done, score: a.score,
        })),
      }
    : {}),
});

export function registerCourseTools(server: McpServer) {
  server.registerTool(
    "add_course",
    {
      title: "Add course",
      description:
        "Add a school course. If he pastes or shares a course outline (text or PDF), pull out the code, title, " +
        "description, lecturer, units, the topics in order (with week numbers if given) and every test, quiz, exam " +
        "and assignment with its date and weight, and send it all in one call — then summarise what you found and " +
        "ask about anything missing. Without an outline, start with what he tells you; topics can be added later. " +
        "Exams/tests/quizzes become important events; assignments/projects become tasks due on their date that " +
        "turn must-do 2 days before. Study time and topic confidence are tracked under the course (its own academic skill).",
      inputSchema: z.object({
        code: z.string().trim().min(1).max(20).optional().describe("e.g. 'MTH 201'"),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        semester: z.string().trim().optional(),
        lecturer: z.string().trim().optional(),
        units: z.number().int().min(0).max(30).optional(),
        target_grade: z.string().trim().optional(),
        topics: z.array(topic).default([]),
        assessments: z.array(assessment).default([]),
      }),
    },
    async (
      args: {
        code?: string; title: string; description?: string; semester?: string; lecturer?: string; units?: number; target_grade?: string;
        topics: TopicInput[]; assessments: AssessmentArg[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const result = await addCourse(db, { ...args, targetGrade: args.target_grade, assessments: args.assessments.map(toAssessment) }, now);
        return ok(await withMode(db, now, { ...result }));
      } catch (error) {
        return toolError(`add_course failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_courses",
    {
      title: "List courses",
      description:
        "His courses with topic progress (not started / learning / solid, from logged confidence) and the next " +
        "assessment. Pass `course` (code or title) for one course in full: every topic with its status and notes, " +
        "and every assessment with dates, weights and scores. Use it before creating study tasks so they name real topics.",
      inputSchema: z.object({
        course: z.string().trim().min(1).optional(),
        include_finished: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ course, include_finished }: { course?: string; include_finished: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const courses = await loadCourses(db, now, { course, includeFinished: include_finished });
        if (course && courses.length === 0) return toolError(`list_courses: no course "${course}"`);
        return ok(await withMode(db, now, { courses: courses.map((c) => view(c, Boolean(course))) }));
      } catch (error) {
        return toolError(`list_courses failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_course",
    {
      title: "Update course",
      description:
        "Change a course's details, add topics (e.g. from a newly shared outline; existing titles are skipped), remove " +
        "topics, or mark it done/dropped (cancels its open study tasks).",
      inputSchema: z.object({
        course: z.string().trim().min(1).describe("Code, title or id"),
        code: z.string().trim().max(20).nullable().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        semester: z.string().trim().nullable().optional(),
        lecturer: z.string().trim().nullable().optional(),
        units: z.number().int().min(0).max(30).nullable().optional(),
        target_grade: z.string().trim().nullable().optional(),
        status: z.enum(["active", "done", "dropped"]).optional(),
        add_topics: z.array(topic).optional(),
        remove_topics: z.array(z.string().trim().min(1)).optional(),
      }),
    },
    async (
      args: {
        course: string; code?: string | null; title?: string; description?: string | null; semester?: string | null; lecturer?: string | null;
        units?: number | null; target_grade?: string | null; status?: "active" | "done" | "dropped"; add_topics?: TopicInput[]; remove_topics?: string[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { course, target_grade, add_topics, remove_topics, ...rest } = args;
        const result = await updateCourse(db, course, { ...rest, targetGrade: target_grade, addTopics: add_topics, removeTopics: remove_topics }, now);
        return ok(await withMode(db, now, { ...result }));
      } catch (error) {
        return toolError(`update_course failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_assessment",
    {
      title: "Update assessment",
      description:
        "A course's tests, exams and assignments: `add` a new one, or name one (`assessment`, by title) to mark it " +
        "done (an assignment's task completes and pays XP), record the score, change its weight or topics, move its " +
        "date (its event or task moves too), or remove it. Celebrate good scores; be steady about bad ones and ask " +
        "which topics cost marks.",
      inputSchema: z.object({
        course: z.string().trim().min(1).describe("Code, title or id"),
        add: assessment.optional(),
        assessment: z.string().trim().min(1).optional(),
        done: z.boolean().optional(),
        score: z.string().trim().max(50).nullable().optional().describe("As written: '17/20', 'A', '68%'"),
        weight_pct: z.number().int().min(0).max(100).nullable().optional(),
        topics: z.array(z.string().trim().min(1)).optional(),
        date: z.object({ date: z.iso.date(), time: time.optional(), minutes: z.number().int().min(5).max(1440).optional() }).nullable().optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (
      args: {
        course: string; add?: AssessmentArg; assessment?: string; done?: boolean; score?: string | null; weight_pct?: number | null;
        topics?: string[]; date?: { date: string; time?: string; minutes?: number } | null; remove?: boolean;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        if (!args.add && !args.assessment) return toolError("update_assessment: pass `add`, or `assessment` with what to change");
        const result = await changeAssessment(
          db,
          args.course,
          {
            add: args.add ? toAssessment(args.add) : undefined,
            assessment: args.assessment, done: args.done, score: args.score, weightPct: args.weight_pct, topics: args.topics, date: args.date, remove: args.remove,
          },
          now,
        );
        return ok(await withMode(db, now, { ...result }));
      } catch (error) {
        return toolError(`update_assessment failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "propose_study_plan",
    {
      title: "Propose study plan",
      description:
        "Proposes study sessions for the next days from his courses: first topics an exam/test/quiz in the next two " +
        "weeks covers that aren't solid yet (before the exam, shakiest first), then topics due for review, then the " +
        "next new topics in syllabus order. Fitted into each day's free capacity. Nothing is booked: show it briefly " +
        "and book what he accepts with accept_study_plan. `unplaced` = exam topics with no room before the exam — " +
        "say so plainly and offer a fix (more capacity that day, shorter sessions, or dropping something).",
      inputSchema: z.object({
        course: z.string().trim().min(1).optional().describe("Only this course"),
        days: z.number().int().min(1).max(21).default(7),
        session_minutes: z.number().int().min(15).max(240).default(45),
        max_per_day: z.number().int().min(1).max(6).default(2),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args: { course?: string; days: number; session_minutes: number; max_per_day: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const plan = await proposeStudy(db, now, { course: args.course, days: args.days, sessionMinutes: args.session_minutes, maxPerDay: args.max_per_day });
        return ok(await withMode(db, now, { sessions: plan.sessions, unplaced: plan.unplaced, courses: plan.courses }));
      } catch (error) {
        return toolError(`propose_study_plan failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "accept_study_plan",
    {
      title: "Accept study plan",
      description:
        "Books study sessions as tasks (from propose_study_plan, as accepted or tweaked, or ones you make up from " +
        "list_courses). Each is linked to its course and topic, so completing it records the study time; ask how " +
        "solid the topic felt and pass `confidence` to complete_task. A full day refuses the session: report it.",
      inputSchema: z.object({
        sessions: z
          .array(
            z.object({
              course_id: z.uuid(),
              topic: z.string().trim().min(1).max(200),
              day: z.iso.date(),
              minutes: z.number().int().min(5).max(480),
              time: time.optional().describe("Omit = any time that day"),
            }),
          )
          .min(1),
      }),
    },
    async ({ sessions }: { sessions: { course_id: string; topic: string; day: string; minutes: number; time?: string }[] }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const result = await acceptStudy(db, sessions.map((s) => ({ courseId: s.course_id, topic: s.topic, day: s.day, minutes: s.minutes, time: s.time })), now);
        return ok(await withMode(db, now, { ...result }));
      } catch (error) {
        return toolError(`accept_study_plan failed: ${(error as Error).message}`);
      }
    },
  );
}
