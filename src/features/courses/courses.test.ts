import { describe, expect, test } from "bun:test";
import type { TopicSummary } from "@/features/learning/learning";
import { validateWeights } from "@/features/xp/split";
import {
  ASSIGNMENT_WEIGHTS,
  classMinutes,
  classMinutesByWeekday,
  firstOn,
  isSitting,
  parseTopics,
  planStudy,
  plannedKey,
  STUDY_WEIGHTS,
  summarizeCourse,
  topicProgress,
  type AssessmentForPlan,
  type CourseForPlan,
  type CourseTopic,
  type TopicProgress,
} from "./courses";

const today = "2026-10-10";
const practised = (topic: string, confidence: number | null, extra: Partial<TopicSummary> = {}): TopicSummary => ({
  topic,
  sessions: 1,
  minutes: 45,
  lastPractised: "2026-10-05",
  confidence,
  reviewOn: null,
  reviewDue: false,
  ...extra,
});
const topic = (title: string, extra: Partial<TopicProgress> = {}): TopicProgress => ({
  title,
  week: null,
  position: 0,
  status: "not_started",
  confidence: null,
  minutes: 0,
  lastPractised: null,
  reviewOn: null,
  reviewDue: false,
  ...extra,
});
const course = (id: string, topics: TopicProgress[], assessments: AssessmentForPlan[] = []): CourseForPlan => ({ id, label: id, skillId: `skill-${id}`, topics, assessments });
const exam = (title: string, day: string, topics: string[] = [], extra: Partial<AssessmentForPlan> = {}): AssessmentForPlan => ({ title, kind: "exam", day, topics, done: false, ...extra });
const roomAll = (minutes: number, days = 14) => Object.fromEntries(Array.from({ length: days }, (_, i) => [`2026-10-${String(10 + i).padStart(2, "0")}`, minutes]));

describe("weights", () => {
  test("study and assignment weights are valid", () => {
    expect(() => validateWeights(STUDY_WEIGHTS)).not.toThrow();
    expect(() => validateWeights(ASSIGNMENT_WEIGHTS)).not.toThrow();
  });
  test("exams and tests are sat (events); assignments are handed in (tasks)", () => {
    expect(isSitting("exam")).toBe(true);
    expect(isSitting("test")).toBe(true);
    expect(isSitting("assignment")).toBe(false);
    expect(isSitting("project")).toBe(false);
  });
});

describe("topicProgress", () => {
  const syllabus: CourseTopic[] = [
    { title: "Limits", week: 1, position: 0 },
    { title: "Derivatives", week: 2, position: 1 },
    { title: "Integrals", week: 3, position: 2 },
    { title: "Series", week: null, position: 3 },
  ];
  test("not started / learning / solid from logged confidence", () => {
    const p = topicProgress(syllabus, [practised("limits", 5), practised("Derivatives", 2)]);
    expect(p.map((t) => [t.title, t.status])).toEqual([
      ["Limits", "solid"],
      ["Derivatives", "learning"],
      ["Integrals", "not_started"],
      ["Series", "not_started"],
    ]);
  });
  test("studied but never rated is still learning, not solid", () => {
    expect(topicProgress(syllabus, [practised("Integrals", null)])[2]!.status).toBe("learning");
  });
  test("confidence 4 is the line for solid", () => {
    expect(topicProgress([syllabus[0]!], [practised("Limits", 4)])[0]!.status).toBe("solid");
    expect(topicProgress([syllabus[0]!], [practised("Limits", 3)])[0]!.status).toBe("learning");
  });
  test("syllabus order: by week, undated weeks last, then position", () => {
    const p = topicProgress([{ title: "B", week: null, position: 0 }, { title: "A", week: 2, position: 5 }, { title: "C", week: 1, position: 9 }], []);
    expect(p.map((t) => t.title)).toEqual(["C", "A", "B"]);
  });
  test("carries the review date through", () => {
    const p = topicProgress([syllabus[0]!], [practised("Limits", 2, { reviewOn: "2026-10-07", reviewDue: true })]);
    expect(p[0]).toMatchObject({ reviewOn: "2026-10-07", reviewDue: true });
  });
});

describe("planStudy", () => {
  test("exam prep comes first, before the exam, shakiest topic first", () => {
    const c = course("MTH", [topic("Limits", { status: "learning", confidence: 3 }), topic("Derivatives", { status: "learning", confidence: 1 }), topic("Integrals")], [
      exam("Midterm", "2026-10-13", ["Limits", "Derivatives"]),
    ]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600), maxPerDay: 1, days: 3 });
    expect(plan.sessions.map((s) => [s.day, s.topic, s.why])).toEqual([
      ["2026-10-10", "Derivatives", "exam_prep"],
      ["2026-10-11", "Limits", "exam_prep"],
      ["2026-10-12", "Integrals", "new_topic"],
    ]);
    expect(plan.sessions[0]!.for).toBe("Midterm");
  });
  test("solid topics aren't revised for the exam", () => {
    const c = course("MTH", [topic("Limits", { status: "solid", confidence: 5 })], [exam("Midterm", "2026-10-13")]);
    expect(planStudy({ today, courses: [c], room: roomAll(600) }).sessions).toEqual([]);
  });
  test("an exam with no topic list covers the whole course", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 2 }), topic("B", { status: "learning", confidence: 2 })], [exam("Final", "2026-10-15")]);
    expect(planStudy({ today, courses: [c], room: roomAll(600) }).sessions.every((s) => s.why === "exam_prep")).toBe(true);
  });
  test("topic names match the exam's list case-insensitively", () => {
    const c = course("MTH", [topic("Limits", { status: "learning", confidence: 2 })], [exam("Quiz 1", "2026-10-12", ["  limits "])]);
    expect(planStudy({ today, courses: [c], room: roomAll(600) }).sessions[0]!.why).toBe("exam_prep");
  });
  test("exams beyond the prep window don't pull topics in yet", () => {
    const c = course("MTH", [topic("Limits", { status: "learning", confidence: 2 })], [exam("Final", "2026-11-30")]);
    expect(planStudy({ today, courses: [c], room: roomAll(600), days: 7 }).sessions).toEqual([]);
  });
  test("done or past assessments are ignored", () => {
    const c = course("MTH", [topic("Limits", { status: "learning", confidence: 2 })], [
      exam("Old quiz", "2026-10-08"),
      exam("Done quiz", "2026-10-12", [], { done: true }),
    ]);
    expect(planStudy({ today, courses: [c], room: roomAll(600) }).sessions).toEqual([]);
  });
  test("assignments don't trigger revision", () => {
    const c = course("MTH", [topic("Limits", { status: "learning", confidence: 2 })], [{ title: "HW 3", kind: "assignment", day: "2026-10-12", topics: [], done: false }]);
    expect(planStudy({ today, courses: [c], room: roomAll(600) }).sessions).toEqual([]);
  });
  test("prep that can't fit before the exam is reported, not silently dropped", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 1 }), topic("B", { status: "learning", confidence: 2 }), topic("C", { status: "learning", confidence: 3 })], [
      exam("Quiz", "2026-10-12"),
    ]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600), maxPerDay: 1 });
    expect(plan.sessions.map((s) => s.topic)).toEqual(["A", "B"]);
    expect(plan.unplaced).toEqual([{ course: "MTH", topic: "C", for: "Quiz", day: "2026-10-12" }]);
  });
  test("nothing goes on the exam day itself", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 1 })], [exam("Quiz", "2026-10-11")]);
    const plan = planStudy({ today, courses: [c], room: { "2026-10-10": 0, "2026-10-11": 600 } });
    expect(plan.sessions).toEqual([]);
    expect(plan.unplaced).toHaveLength(1);
  });
  test("reviews go on or after their due date; overdue ones start today", () => {
    const c = course("MTH", [
      topic("Old", { status: "learning", confidence: 2, reviewOn: "2026-10-05" }),
      topic("Later", { status: "solid", confidence: 4, reviewOn: "2026-10-13" }),
      topic("Far", { status: "solid", confidence: 5, reviewOn: "2026-10-30" }),
    ]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600), days: 7 });
    expect(plan.sessions.map((s) => [s.day, s.topic, s.why])).toEqual([
      ["2026-10-10", "Old", "review"],
      ["2026-10-13", "Later", "review"],
    ]);
  });
  test("new topics: syllabus order, one per course per day, round-robin across courses", () => {
    const a = course("MTH", [topic("M1"), topic("M2")]);
    const b = course("PHY", [topic("P1")]);
    const plan = planStudy({ today, courses: [a, b], room: roomAll(600), maxPerDay: 3, days: 2 });
    expect(plan.sessions.map((s) => [s.day, s.topic])).toEqual([
      ["2026-10-10", "M1"],
      ["2026-10-10", "P1"],
      ["2026-10-11", "M2"],
    ]);
  });
  test("respects free capacity and the per-day cap", () => {
    const c = course("MTH", [topic("A"), topic("B"), topic("C")]);
    expect(planStudy({ today, courses: [c], room: { "2026-10-10": 44 }, days: 1 }).sessions).toEqual([]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600), sessionMinutes: 30, maxPerDay: 2, days: 3 });
    expect(plan.sessions.filter((s) => s.day === "2026-10-10")).toHaveLength(1); // one new topic per course per day
    expect(plan.sessions.every((s) => s.minutes === 30)).toBe(true);
  });
  test("a full day is skipped, the plan continues the next day", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 1 })], [exam("Quiz", "2026-10-13")]);
    const plan = planStudy({ today, courses: [c], room: { "2026-10-10": 0, "2026-10-11": 120 } });
    expect(plan.sessions.map((s) => s.day)).toEqual(["2026-10-11"]);
  });
  test("topics already booked as open study tasks aren't booked again", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 1 }), topic("B")], [exam("Quiz", "2026-10-13", ["A"])]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600), alreadyPlanned: new Set([plannedKey("MTH", "A"), plannedKey("MTH", "B")]) });
    expect(plan.sessions).toEqual([]);
    expect(plan.unplaced).toEqual([]);
  });
  test("each topic appears once, even if it's both exam prep and due for review", () => {
    const c = course("MTH", [topic("A", { status: "learning", confidence: 2, reviewOn: "2026-10-09" })], [exam("Quiz", "2026-10-13")]);
    const plan = planStudy({ today, courses: [c], room: roomAll(600) });
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0]!.why).toBe("exam_prep");
  });
  test("sooner exam's topics go first across courses", () => {
    const a = course("MTH", [topic("M", { status: "learning", confidence: 1 })], [exam("MTH final", "2026-10-16")]);
    const b = course("PHY", [topic("P", { status: "learning", confidence: 3 })], [exam("PHY test", "2026-10-12")]);
    const plan = planStudy({ today, courses: [a, b], room: roomAll(600), maxPerDay: 1 });
    expect(plan.sessions.map((s) => s.topic)).toEqual(["P", "M"]);
  });
  test("no courses: empty plan", () => {
    expect(planStudy({ today, courses: [], room: roomAll(600) })).toEqual({ sessions: [], unplaced: [] });
  });
});

describe("summarizeCourse", () => {
  test("topic counts and the next assessment", () => {
    const s = summarizeCourse(
      [topic("A"), topic("B", { status: "learning" }), topic("C", { status: "solid" })],
      [exam("Done", "2026-10-11", [], { done: true }), exam("Final", "2026-10-20"), exam("Quiz", "2026-10-14"), { title: "Essay", kind: "assignment", day: null, topics: [], done: false }],
      today,
    );
    expect(s.topics).toEqual({ total: 3, notStarted: 1, learning: 1, solid: 1 });
    expect(s.next).toEqual({ title: "Quiz", kind: "exam", day: "2026-10-14", daysAway: 4 });
  });
  test("an assessment today is still next", () => {
    expect(summarizeCourse([], [exam("Quiz", today)], today).next?.daysAway).toBe(0);
  });
  test("nothing upcoming: null", () => {
    expect(summarizeCourse([], [], today).next).toBeNull();
  });
});

describe("parseTopics", () => {
  test("one per line; bullets and numbering stripped; blank lines skipped", () => {
    expect(parseTopics("- Limits\n\n2. Derivatives\n• Integrals\n3) Series")).toEqual([
      { title: "Limits", week: null },
      { title: "Derivatives", week: null },
      { title: "Integrals", week: null },
      { title: "Series", week: null },
    ]);
  });
  test("keeps the week from 'Week 3: …'", () => {
    expect(parseTopics("Week 3: Integration by parts\nweek 10 - Taylor series")).toEqual([
      { title: "Integration by parts", week: 3 },
      { title: "Taylor series", week: 10 },
    ]);
  });
  test("a title that starts with a number but isn't numbering stays whole", () => {
    expect(parseTopics("3D geometry")).toEqual([{ title: "3D geometry", week: null }]);
  });
  test("drops lines that are empty after stripping, or too long", () => {
    expect(parseTopics("- \n" + "x".repeat(201))).toEqual([]);
  });
});

describe("timetable", () => {
  test("class length", () => {
    expect(classMinutes("09:00", "11:00")).toBe(120);
    expect(classMinutes("14:30", "15:20")).toBe(50);
    expect(() => classMinutes("11:00", "09:00")).toThrow(RangeError);
  });
  test("first class on or after the start", () => {
    expect(firstOn("2026-10-12", ["MO", "WE"])).toBe("2026-10-12"); // a Monday
    expect(firstOn("2026-10-13", ["MO", "WE"])).toBe("2026-10-14"); // Tue → Wed
    expect(firstOn("2026-10-16", ["MO"])).toBe("2026-10-19"); // Fri → next Mon
  });
  test("minutes per weekday add up across courses", () => {
    const m = classMinutesByWeekday([{ days: ["MO", "WE"], minutes: 120 }, { days: ["MO"], minutes: 180 }, { days: ["FR"], minutes: 60 }]);
    expect(m.MO).toBe(300);
    expect(m.WE).toBe(120);
    expect(m.FR).toBe(60);
    expect(m.SU).toBe(0);
  });
});
