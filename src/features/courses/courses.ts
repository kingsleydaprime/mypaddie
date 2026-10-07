import type { TopicSummary } from "@/features/learning/learning";
import type { PillarWeight } from "@/features/xp/split";
import { addDays, weekdayOf } from "@/shared/time";

export const ASSESSMENT_KINDS = ["exam", "test", "quiz", "assignment", "project", "presentation", "lab", "other"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

/** Sat in person at a set time → an event. Everything else is work handed in → a task. */
export const isSitting = (k: AssessmentKind) => k === "exam" || k === "test" || k === "quiz" || k === "presentation" || k === "lab";

/** Assessments that study sessions prepare for. */
export const needsRevision = (k: AssessmentKind) => k === "exam" || k === "test" || k === "quiz";

/** Studying is academic; handing work in on time also builds character. */
export const STUDY_WEIGHTS: PillarWeight[] = [{ pillar: "academic", weight: 100 }];
export const ASSIGNMENT_WEIGHTS: PillarWeight[] = [{ pillar: "academic", weight: 70 }, { pillar: "character", weight: 30 }];

/** Confidence at or above this = solid; below = still learning. */
export const SOLID_CONFIDENCE = 4;

export type TopicStatus = "not_started" | "learning" | "solid";

export interface CourseTopic {
  title: string;
  week: number | null;
  position: number;
}

export interface TopicProgress extends CourseTopic {
  status: TopicStatus;
  confidence: number | null;
  minutes: number;
  lastPractised: string | null;
  reviewOn: string | null;
  reviewDue: boolean;
}

/**
 * A syllabus topic's progress, from the learning sessions logged under the
 * course's skill (matched by title, case-insensitively). Studied but never
 * rated counts as learning: there's no evidence it's solid.
 */
export function topicProgress(topics: readonly CourseTopic[], practised: readonly TopicSummary[]): TopicProgress[] {
  const byTitle = new Map(practised.map((t) => [t.topic.trim().toLowerCase(), t]));
  return [...topics]
    .sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || a.position - b.position)
    .map((t) => {
      const p = byTitle.get(t.title.trim().toLowerCase());
      const status: TopicStatus = !p ? "not_started" : p.confidence !== null && p.confidence >= SOLID_CONFIDENCE ? "solid" : "learning";
      return {
        ...t,
        status,
        confidence: p?.confidence ?? null,
        minutes: p?.minutes ?? 0,
        lastPractised: p?.lastPractised ?? null,
        reviewOn: p?.reviewOn ?? null,
        reviewDue: p?.reviewDue ?? false,
      };
    });
}

export interface AssessmentForPlan {
  title: string;
  kind: AssessmentKind;
  /** Local day it happens / is due; null = undated. */
  day: string | null;
  /** Topic titles it covers; empty = every topic of the course. */
  topics: readonly string[];
  done: boolean;
}

export interface CourseForPlan {
  id: string;
  /** "MTH 201" or the title: what task titles start with. */
  label: string;
  skillId: string;
  topics: readonly TopicProgress[];
  assessments: readonly AssessmentForPlan[];
}

export type StudyReason = "exam_prep" | "review" | "new_topic";

export interface StudySession {
  day: string;
  courseId: string;
  course: string;
  skillId: string;
  topic: string;
  minutes: number;
  why: StudyReason;
  /** The assessment it prepares for (exam_prep only). */
  for?: string;
}

export interface StudyPlan {
  sessions: StudySession[];
  /** Exam-prep topics that found no room before their assessment. Say so: it's a real risk. */
  unplaced: { course: string; topic: string; for: string; day: string }[];
}

export interface StudyPlanInput {
  today: string;
  courses: readonly CourseForPlan[];
  /** Days to plan, starting today. */
  days?: number;
  sessionMinutes?: number;
  maxPerDay?: number;
  /** Free capacity per day in minutes (after everything else on it); missing day = none. */
  room: Readonly<Record<string, number>>;
  /** "courseId|topic" already scheduled as an open study task: don't double-book. */
  alreadyPlanned?: ReadonlySet<string>;
  /** How far ahead an exam pulls its topics into the plan. */
  prepWindowDays?: number;
}

interface Candidate {
  course: CourseForPlan;
  topic: TopicProgress;
  why: StudyReason;
  /** Earliest day it may go on. */
  from: string;
  /** Must be before this day (the assessment); null = any day. */
  before: string | null;
  for?: string;
  rank: [number, string, number];
}

export const plannedKey = (courseId: string, topic: string) => `${courseId}|${topic.trim().toLowerCase()}`;

/**
 * Proposes study sessions for the coming days. Order of need:
 *   1. exam prep — topics an exam/test/quiz in the next two weeks covers that
 *      aren't solid yet, placed before it, sooner exams and shakier topics first
 *   2. review — topics whose spaced-repetition date falls in the window
 *   3. new topics — the next unstudied ones in syllabus order, at most one
 *      per course per day so new material doesn't crowd out practice
 * Each topic appears once. A day takes at most `maxPerDay` sessions and never
 * more than its free capacity.
 */
export function planStudy(input: StudyPlanInput): StudyPlan {
  const days = input.days ?? 7;
  const minutes = input.sessionMinutes ?? 45;
  const maxPerDay = input.maxPerDay ?? 2;
  const prepWindow = input.prepWindowDays ?? 14;
  const lastDay = addDays(input.today, days - 1);
  const horizon = addDays(input.today, prepWindow);
  const planned = input.alreadyPlanned ?? new Set<string>();

  const candidates: Candidate[] = [];
  const taken = new Set<string>();
  const add = (c: Candidate) => {
    const key = plannedKey(c.course.id, c.topic.title);
    if (planned.has(key) || taken.has(key)) return;
    taken.add(key);
    candidates.push(c);
  };

  // 1. Exam prep, soonest assessment first.
  const sittings = input.courses
    .flatMap((course) => course.assessments.map((a) => ({ course, a })))
    .filter(({ a }) => !a.done && needsRevision(a.kind) && a.day !== null && a.day > input.today && a.day <= horizon)
    .sort((x, y) => x.a.day!.localeCompare(y.a.day!));
  for (const { course, a } of sittings) {
    const wanted = a.topics.map((t) => t.trim().toLowerCase());
    const covered = course.topics.filter((t) => wanted.length === 0 || wanted.includes(t.title.trim().toLowerCase()));
    for (const topic of covered.filter((t) => t.status !== "solid")) {
      add({ course, topic, why: "exam_prep", from: input.today, before: a.day, for: a.title, rank: [0, a.day!, topic.confidence ?? 0] });
    }
  }

  // 2. Reviews falling due in the window.
  for (const course of input.courses) {
    for (const topic of course.topics) {
      if (topic.reviewOn !== null && topic.reviewOn <= lastDay) {
        const from = topic.reviewOn < input.today ? input.today : topic.reviewOn;
        add({ course, topic, why: "review", from, before: null, rank: [1, topic.reviewOn, topic.confidence ?? 0] });
      }
    }
  }

  const sessions: StudySession[] = [];
  const unplaced: StudyPlan["unplaced"] = [];
  const newQueues = new Map(
    input.courses.map((c) => [c.id, c.topics.filter((t) => t.status === "not_started" && !planned.has(plannedKey(c.id, t.title)) && !taken.has(plannedKey(c.id, t.title)))]),
  );

  for (let i = 0; i < days; i++) {
    const day = addDays(input.today, i);
    let free = input.room[day] ?? 0;
    let slots = maxPerDay;
    const place = (course: CourseForPlan, topic: TopicProgress, why: StudyReason, forTitle?: string) => {
      sessions.push({ day, courseId: course.id, course: course.label, skillId: course.skillId, topic: topic.title, minutes, why, ...(forTitle ? { for: forTitle } : {}) });
      free -= minutes;
      slots -= 1;
    };

    const ready = candidates
      .filter((c) => c.from <= day && (c.before === null || day < c.before))
      .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1].localeCompare(b.rank[1]) || a.rank[2] - b.rank[2]);
    for (const c of ready) {
      if (slots === 0 || free < minutes) break;
      place(c.course, c.topic, c.why, c.for);
      candidates.splice(candidates.indexOf(c), 1);
    }

    // 3. New material with whatever's left, round-robin across courses.
    for (const course of input.courses) {
      if (slots === 0 || free < minutes) break;
      const next = newQueues.get(course.id)?.shift();
      if (next) place(course, next, "new_topic");
    }
  }

  for (const c of candidates) {
    if (c.why === "exam_prep" && c.before !== null && c.before <= addDays(lastDay, 1)) {
      unplaced.push({ course: c.course.label, topic: c.topic.title, for: c.for!, day: c.before });
    }
  }
  return { sessions, unplaced };
}

export interface CourseSummary {
  topics: { total: number; notStarted: number; learning: number; solid: number };
  /** The next assessment not yet done, by date. */
  next: { title: string; kind: AssessmentKind; day: string; daysAway: number } | null;
}

export function summarizeCourse(topics: readonly TopicProgress[], assessments: readonly AssessmentForPlan[], today: string): CourseSummary {
  const count = (s: TopicStatus) => topics.filter((t) => t.status === s).length;
  const next = assessments
    .filter((a) => !a.done && a.day !== null && a.day >= today)
    .sort((a, b) => a.day!.localeCompare(b.day!))[0];
  return {
    topics: { total: topics.length, notStarted: count("not_started"), learning: count("learning"), solid: count("solid") },
    next: next
      ? { title: next.title, kind: next.kind, day: next.day!, daysAway: Math.round((Date.parse(`${next.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) }
      : null,
  };
}

/**
 * Topics pasted one per line. "Week 3: Integrals" or "3. Integrals" keeps the
 * week; bullets and numbering are stripped.
 */
export function parseTopics(raw: string): { title: string; week: number | null }[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const week = line.match(/^week\s*(\d{1,2})\s*[:.\-–)]\s*/i);
      const title = line.replace(/^week\s*\d{1,2}\s*[:.\-–)]\s*/i, "").replace(/^([-*•]|\d{1,3}[.)])\s*/, "").trim();
      return { title, week: week ? Number(week[1]) : null };
    })
    .filter((t) => t.title.length > 0 && t.title.length <= 200);
}

// ─── Timetable ──────────────────────────────────────────────────────────────
export const CLASS_KINDS = ["lecture", "tutorial", "lab", "seminar", "practical", "other"] as const;
export type ClassKind = (typeof CLASS_KINDS)[number];
export const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Attending is effort too, but it isn't the study: a small, steady amount. */
export const CLASS_WEIGHTS: PillarWeight[] = [{ pillar: "academic", weight: 100 }];
export const CLASS_BASE_XP = 5;

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "09:00"–"11:00" → 120. End must be after start, same day. */
export function classMinutes(start: string, end: string): number {
  const m = toMinutes(end) - toMinutes(start);
  if (!(m > 0)) throw new RangeError(`a class has to end after it starts (${start}–${end})`);
  return m;
}

/** The first date on or after `from` that falls on one of `days`. */
export function firstOn(from: string, days: readonly WeekdayCode[]): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (days.includes(WEEKDAY_CODES[weekdayOf(d)]!)) return d;
  }
  throw new RangeError("no class days given");
}

export interface ClassSlot {
  days: readonly WeekdayCode[];
  minutes: number;
}

/** Class minutes on each weekday — to warn when a day's classes already pass its capacity. */
export function classMinutesByWeekday(classes: readonly ClassSlot[]): Record<WeekdayCode, number> {
  const out = Object.fromEntries(WEEKDAY_CODES.map((d) => [d, 0])) as Record<WeekdayCode, number>;
  for (const c of classes) for (const d of c.days) out[d] += c.minutes;
  return out;
}
