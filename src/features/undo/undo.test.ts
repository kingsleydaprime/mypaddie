import { describe, expect, test } from "bun:test";
import { cancelOnUndo, kindOfTask } from "./undo";

const at = (t: string) => new Date(`2026-10-07T${t}:00+01:00`);

describe("cancelOnUndo", () => {
  test("logged after the fact (created and done together, undated): cancel", () => {
    expect(cancelOnUndo({ dueAt: null, seriesId: null, createdAt: at("18:00"), doneAt: at("18:00") })).toBe(true);
  });
  test("two minutes apart still counts as one moment", () => {
    expect(cancelOnUndo({ dueAt: null, seriesId: null, createdAt: at("18:00"), doneAt: at("18:02") })).toBe(true);
  });
  test("an undated chore added earlier and ticked later: back to pending", () => {
    expect(cancelOnUndo({ dueAt: null, seriesId: null, createdAt: at("09:00"), doneAt: at("18:00") })).toBe(false);
  });
  test("anything with a date goes back to pending", () => {
    expect(cancelOnUndo({ dueAt: at("18:00"), seriesId: null, createdAt: at("18:00"), doneAt: at("18:00") })).toBe(false);
  });
  test("a habit's day goes back to pending", () => {
    expect(cancelOnUndo({ dueAt: null, seriesId: "s", createdAt: at("18:00"), doneAt: at("18:00") })).toBe(false);
  });
  test("not done: nothing to cancel", () => {
    expect(cancelOnUndo({ dueAt: null, seriesId: null, createdAt: at("18:00"), doneAt: null })).toBe(false);
  });
});

describe("kindOfTask", () => {
  test("fun beats workout beats plain task", () => {
    expect(kindOfTask({ funActivityId: "f", hasWorkoutLog: true })).toBe("fun");
    expect(kindOfTask({ funActivityId: null, hasWorkoutLog: true })).toBe("workout");
    expect(kindOfTask({ funActivityId: null, hasWorkoutLog: false })).toBe("task");
  });
});
