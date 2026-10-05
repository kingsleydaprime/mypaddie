import { describe, expect, test } from "bun:test";
import { pickFocus, type TaskForFocus } from "./focus";

const at = (local: string) => new Date(`${local}+01:00`);
const now = at("2026-10-06T10:00:00");

let n = 0;
function task(overrides: Partial<TaskForFocus>): TaskForFocus {
  n += 1;
  return {
    id: `t${n}`,
    title: `task ${n}`,
    tier: null,
    isNonNegotiable: false,
    dueAt: at("2026-10-06T18:00:00"),
    status: "pending",
    ...overrides,
  };
}

const titles = (items: { title: string }[]) => items.map((i) => i.title);

describe("pickFocus", () => {
  test("never more than 3 at the top; the rest are one tap away", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => task({ title: `t${i}` }));
    const focus = pickFocus(tasks, now);
    expect(focus.top).toHaveLength(3);
    expect(focus.rest).toHaveLength(3);
  });

  test("an overdue non-negotiable beats everything", () => {
    const focus = pickFocus(
      [
        task({ title: "side project", dueAt: at("2026-10-06T09:00:00") }),
        task({ title: "rhapsody", isNonNegotiable: true, tier: "need", dueAt: at("2026-10-06T07:00:00") }),
        task({ title: "food", tier: "need", dueAt: at("2026-10-06T08:00:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["rhapsody", "food", "side project"]);
    expect(focus.top[0]!.overdue).toBe(true);
  });

  test("an upcoming non-negotiable beats an overdue ordinary task", () => {
    const focus = pickFocus(
      [
        task({ title: "school reading", dueAt: at("2026-10-06T08:00:00") }),
        task({ title: "duolingo", isNonNegotiable: true, dueAt: at("2026-10-06T20:00:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["duolingo", "school reading"]);
  });

  test("within a group, earliest due first; undated last", () => {
    const focus = pickFocus(
      [
        task({ title: "evening", tier: "need", dueAt: at("2026-10-06T21:00:00") }),
        task({ title: "anytime", tier: "need", dueAt: null }),
        task({ title: "noon", tier: "need", dueAt: at("2026-10-06T12:00:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["noon", "evening", "anytime"]);
  });

  test("done and cancelled tasks are not suggested", () => {
    const focus = pickFocus(
      [
        task({ title: "done", status: "done" }),
        task({ title: "cancelled", status: "cancelled" }),
        task({ title: "skipped", status: "skipped" }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["skipped"]);
  });

  test("tomorrow's tasks don't crowd today", () => {
    const focus = pickFocus([task({ title: "tomorrow", dueAt: at("2026-10-07T07:00:00") })], now);
    expect(focus.top).toEqual([]);
  });

  test("yesterday's undone task shows as overdue — late still earns XP", () => {
    const focus = pickFocus([task({ title: "yesterday", dueAt: at("2026-10-05T07:00:00") })], now);
    expect(focus.top[0]).toMatchObject({ title: "yesterday", overdue: true });
  });

  test("counts what's been done today", () => {
    const focus = pickFocus(
      [
        task({ status: "done", dueAt: at("2026-10-06T07:00:00") }),
        task({ status: "done", dueAt: at("2026-10-05T07:00:00") }),
      ],
      now,
    );
    expect(focus.doneToday).toBe(1);
  });

  test("an empty day is an empty focus", () => {
    expect(pickFocus([], now)).toEqual({ top: [], rest: [], doneToday: 0 });
  });
});
