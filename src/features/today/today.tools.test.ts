import { describe, expect, test } from "bun:test";
import { itemWith } from "./today.tools";

describe("itemWith", () => {
  test("keeps actionable routine step references in the MCP result", () => {
    const item = itemWith("any time")({
      id: "church-task",
      title: "Sunday routine",
      dueAt: null,
      overdue: false,
      nonNegotiable: true,
      routine: {
        title: "Sunday routine",
        next: "Church",
        done: 1,
        total: 2,
        items: [{ id: "church-task", title: "Church", done: false, status: "pending", stepNumber: 2, habitId: "church-series" }],
      },
      startedAt: null,
      spentMinutes: 0,
      steps: null,
      forLabel: null,
      priority: "normal",
    });

    expect(item.routine).toEqual({
      title: "Sunday routine",
      next: "Church",
      done: 1,
      total: 2,
      items: [{ task_id: "church-task", step_number: 2, title: "Church", status: "pending", done: false, habit_id: "church-series" }],
    });
  });
});
