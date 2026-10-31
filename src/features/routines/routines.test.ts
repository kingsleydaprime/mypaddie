import { describe, expect, test } from "bun:test";
import { routineStepReferences } from "./routines.repo";
import { planRoutineEdit, planRoutineFinish, stepTimes } from "./routines";

const morning = [
  { title: "Pray", minutes: 15 },
  { title: "Brush", minutes: 5 },
  { title: "Stretch", minutes: 10 },
];

describe("planRoutineEdit", () => {
  test("no changes keeps everything in order", () => {
    const p = planRoutineEdit(morning, {});
    expect(p.ok && p.steps.map((s) => s.title)).toEqual(["Pray", "Brush", "Stretch"]);
  });
  test("remove by name, any case", () => {
    const p = planRoutineEdit(morning, { remove: ["brush"] });
    expect(p.ok && p.steps.map((s) => s.title)).toEqual(["Pray", "Stretch"]);
    expect(p.ok && p.removed).toEqual(["Brush"]);
  });
  test("removing a step that isn't there is refused", () => {
    expect(planRoutineEdit(morning, { remove: ["Jog"] })).toEqual({ ok: false, reason: "unknown_step", step: "Jog" });
  });
  test("added steps go at the end, 10 minutes by default", () => {
    const p = planRoutineEdit(morning, { add: [{ title: "Rhapsody" }] });
    expect(p.ok && p.steps.at(-1)).toEqual({ kind: "add", title: "Rhapsody", minutes: 10 });
  });
  test("adding a step that's already there is refused", () => {
    expect(planRoutineEdit(morning, { add: [{ title: "PRAY" }] })).toEqual({ ok: false, reason: "duplicate_step", step: "PRAY" });
  });
  test("an order can place new steps too", () => {
    const p = planRoutineEdit(morning, { add: [{ title: "Rhapsody", minutes: 10 }], order: ["Pray", "Rhapsody", "Brush", "Stretch"] });
    expect(p.ok && p.steps.map((s) => s.title)).toEqual(["Pray", "Rhapsody", "Brush", "Stretch"]);
  });
  test("an order must name every step exactly once", () => {
    expect(planRoutineEdit(morning, { order: ["Pray", "Brush"] })).toEqual({ ok: false, reason: "order_mismatch", missing: ["Stretch"], extra: [] });
    expect(planRoutineEdit(morning, { order: ["Pray", "Brush", "Stretch", "Jog"] })).toEqual({ ok: false, reason: "order_mismatch", missing: [], extra: ["Jog"] });
    expect(planRoutineEdit(morning, { order: ["Pray", "Pray", "Brush", "Stretch"] }).ok).toBe(false);
  });
  test("removing every step is refused — stop the routine instead", () => {
    expect(planRoutineEdit(morning, { remove: ["Pray", "Brush", "Stretch"] })).toEqual({ ok: false, reason: "empty" });
  });
});

describe("stepTimes", () => {
  test("back to back from the start", () => {
    expect(stepTimes("06:00", [15, 5, 10])).toEqual(["06:00", "06:15", "06:20"]);
  });
  test("wraps past midnight", () => {
    expect(stepTimes("23:50", [15, 5])).toEqual(["23:50", "00:05"]);
  });
  test("no start time: any time that day", () => {
    expect(stepTimes(null, [15, 5])).toEqual([null, null]);
  });
});

describe("routineStepReferences", () => {
  test("resolves today's occurrence and the recurring step independently", () => {
    const rows = [
      { id: "pray-today", routine_id: "morning", routine_step: 1, title: "Pray", series_id: "pray-series", occurs_on: "2026-10-11", status: "done" as const },
      { id: "pray-next", routine_id: "morning", routine_step: 1, title: "Pray", series_id: "pray-series", occurs_on: "2026-10-12", status: "pending" as const },
      { id: "brush-today", routine_id: "morning", routine_step: 2, title: "Brush", series_id: "brush-series", occurs_on: "2026-10-11", status: "pending" as const },
      { id: "other-routine", routine_id: "evening", routine_step: 1, title: "Pray", series_id: "evening-pray", occurs_on: "2026-10-11", status: "pending" as const },
    ];

    expect(routineStepReferences(rows, "morning", "2026-10-11")).toEqual([
      {
        stepNumber: 1,
        title: "Pray",
        habitId: "pray-series",
        today: { taskId: "pray-today", on: "2026-10-11", status: "done" },
        next: { taskId: "pray-next", on: "2026-10-12" },
      },
      {
        stepNumber: 2,
        title: "Brush",
        habitId: "brush-series",
        today: { taskId: "brush-today", on: "2026-10-11", status: "pending" },
        next: { taskId: "brush-today", on: "2026-10-11" },
      },
    ]);
  });
});

describe("Done on a routine finishes it: what isn't ticked is settled", () => {
  // Kingsley, 2026-10-31: morning routine 9/11, Pray and Read Bible left. Done should end it, the two marked missed.
  test("every open step is marked missed; ticked steps are left alone", () => {
    const plan = planRoutineFinish([
      { id: "wake", status: "done" },
      { id: "pray", status: "pending" },
      { id: "bible", status: "pending" },
      { id: "brush", status: "done" },
    ]);
    expect(plan).toEqual({ miss: ["pray", "bible"], cancel: [] });
  });

  test("a step skipped with a reason is closed, not penalised as missed", () => {
    expect(planRoutineFinish([{ id: "bath", status: "skipped" }, { id: "skin", status: "pending" }])).toEqual({ miss: ["skin"], cancel: ["bath"] });
  });

  test("steps already missed or cancelled aren't touched again", () => {
    expect(planRoutineFinish([{ id: "a", status: "missed" }, { id: "b", status: "cancelled" }, { id: "c", status: "done" }])).toEqual({ miss: [], cancel: [] });
  });
});
