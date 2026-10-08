import { describe, expect, test } from "bun:test";
import { MAX_STEPS, planChecklist, readChecklist, stepsDone, tickStep, timeSpent, type Step } from "./progress";

const steps = (...s: [string, boolean][]): Step[] => s.map(([text, done]) => ({ text, done }));

describe("readChecklist", () => {
  test("reads what's stored", () => {
    expect(readChecklist([{ text: "Pray", done: true }, { text: "Read", done: false }])).toEqual(steps(["Pray", true], ["Read", false]));
  });
  test("nothing stored is no steps", () => {
    expect(readChecklist(null)).toEqual([]);
  });
  test("malformed entries are dropped, not trusted", () => {
    expect(readChecklist([{ text: "  " }, { done: true }, "Pray", { text: "Read", done: "yes" }])).toEqual(steps(["Read", false]));
  });
});

describe("planChecklist", () => {
  test("new steps start unticked, in order", () => {
    expect(planChecklist([], ["Outline", "Draft", "Edit"])).toEqual({ ok: true, steps: steps(["Outline", false], ["Draft", false], ["Edit", false]) });
  });
  test("a step that stays keeps its tick, whatever the case or where it moves", () => {
    const plan = planChecklist(steps(["Outline", true], ["Draft", false]), ["Draft", "outline", "Edit"]);
    expect(plan).toEqual({ ok: true, steps: steps(["Draft", false], ["outline", true], ["Edit", false]) });
  });
  test("blank lines are ignored and an empty list clears it", () => {
    expect(planChecklist(steps(["Outline", true]), ["", "  "])).toEqual({ ok: true, steps: null });
  });
  test("the same step twice is refused", () => {
    expect(planChecklist([], ["Draft", "draft "])).toEqual({ ok: false, reason: "duplicate", step: "draft" });
  });
  test(`more than ${MAX_STEPS} steps is refused`, () => {
    expect(planChecklist([], Array.from({ length: MAX_STEPS + 1 }, (_, i) => `Step ${i}`))).toEqual({ ok: false, reason: "too_many" });
  });
  test("a step over 200 characters is refused", () => {
    expect(planChecklist([], ["x".repeat(201)])).toMatchObject({ ok: false, reason: "too_long" });
  });
});

describe("tickStep", () => {
  const list = steps(["Outline", false], ["Draft", false]);
  test("by number, from 1", () => {
    expect(tickStep(list, 1)).toEqual({ ok: true, steps: steps(["Outline", true], ["Draft", false]), allDone: false });
  });
  test("by its words, any case", () => {
    expect(tickStep(list, "draft")).toMatchObject({ ok: true, steps: steps(["Outline", false], ["Draft", true]) });
  });
  test("ticking the last one says so (the task itself still waits for Done)", () => {
    expect(tickStep(steps(["Outline", true], ["Draft", false]), 2)).toMatchObject({ ok: true, allDone: true });
  });
  test("unticking", () => {
    expect(tickStep(steps(["Outline", true]), 1, false)).toEqual({ ok: true, steps: steps(["Outline", false]), allDone: false });
  });
  test.each([0, 3, "Publish"])("an unknown step (%p) is refused", (ref) => {
    expect(tickStep(list, ref)).toMatchObject({ ok: false, reason: "unknown_step" });
  });
  test("a task without a checklist says so", () => {
    expect(tickStep([], 1)).toMatchObject({ ok: false, reason: "no_checklist" });
  });
});

describe("stepsDone", () => {
  test("counts ticked steps", () => {
    expect(stepsDone(steps(["a", true], ["b", false], ["c", true]))).toEqual({ done: 2, total: 3 });
  });
  test("no checklist, no count", () => {
    expect(stepsDone([])).toBeNull();
  });
});

describe("timeSpent", () => {
  const start = new Date("2026-10-08T09:00:00+01:00");
  test("whole minutes since it was started", () => {
    expect(timeSpent(start, new Date("2026-10-08T09:55:20+01:00"))).toEqual({ minutes: 55, believable: true });
  });
  test("at least a minute", () => {
    expect(timeSpent(start, new Date("2026-10-08T09:00:10+01:00")).minutes).toBe(1);
  });
  test("a start left running overnight isn't believable as time spent", () => {
    expect(timeSpent(start, new Date("2026-10-09T08:00:00+01:00"))).toEqual({ minutes: 23 * 60, believable: false });
  });
});
