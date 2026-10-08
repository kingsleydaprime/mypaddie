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
        task({ title: "duolingo", isNonNegotiable: true, dueAt: at("2026-10-06T10:45:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["duolingo", "school reading"]);
  });

  test("…but not one that's hours away: that waits (see 'later')", () => {
    const focus = pickFocus(
      [
        task({ title: "school reading", dueAt: at("2026-10-06T08:00:00") }),
        task({ title: "duolingo", isNonNegotiable: true, dueAt: at("2026-10-06T20:00:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["school reading", "duolingo"]);
  });

  test("within a group, earliest due first; undated last", () => {
    const focus = pickFocus(
      [
        task({ title: "10:50", tier: "need", dueAt: at("2026-10-06T10:50:00") }),
        task({ title: "anytime", tier: "need", dueAt: null }),
        task({ title: "10:20", tier: "need", dueAt: at("2026-10-06T10:20:00") }),
      ],
      now,
    );
    expect(titles(focus.top)).toEqual(["10:20", "10:50", "anytime"]);
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

describe("routines take one place", () => {
  const at = (local: string) => new Date(`${local}+01:00`);
  const now = at("2026-10-14T07:30:00");
  const step = (title: string, n: number, status: "pending" | "done" = "pending") => ({
    id: `r${n}`, title, tier: null, isNonNegotiable: true, dueAt: at("2026-10-14T07:00:00"), status,
    routine: { id: "morning", title: "Morning routine", step: n },
  });
  test("open steps collapse into one item: the next step, with progress", () => {
    const tasks = [step("Pray", 1, "done"), step("Read", 2), step("Brush", 3), step("Bath", 4),
      { id: "x", title: "Reply Ada", tier: null, isNonNegotiable: false, dueAt: at("2026-10-14T12:00:00"), status: "pending" as const }];
    const f = pickFocus(tasks, now);
    expect(f.top.map((i) => i.title)).toEqual(["Morning routine", "Reply Ada"]);
    expect(f.top[0]).toMatchObject({ id: "r2", routine: { next: "Read", done: 1, total: 4 } });
  });
  test("each of today's steps comes along, in order, ticked or not", () => {
    const f = pickFocus([step("Read", 2), step("Pray", 1, "done"), step("Brush", 3)], now);
    expect(f.top[0]!.routine!.items).toEqual([
      { id: "r1", title: "Pray", done: true },
      { id: "r2", title: "Read", done: false },
      { id: "r3", title: "Brush", done: false },
    ]);
  });
  test("a finished routine disappears", () => {
    const f = pickFocus([step("Pray", 1, "done"), step("Read", 2, "done")], now);
    expect(f.top).toEqual([]);
  });
});

describe("in progress", () => {
  test("a started task comes first, even above an overdue must-do", () => {
    const f = pickFocus([
      task({ title: "Pray", isNonNegotiable: true, dueAt: at("2026-10-06T07:00:00") }),
      task({ title: "Write the report", startedAt: at("2026-10-06T09:30:00") }),
    ], now);
    expect(titles(f.top)).toEqual(["Write the report", "Pray"]);
    expect(f.top[0]!.startedAt).toEqual(at("2026-10-06T09:30:00"));
  });

  test("its checklist progress comes along", () => {
    const f = pickFocus([task({ title: "Essay", steps: { done: 2, total: 5 } })], now);
    expect(f.top[0]!.steps).toEqual({ done: 2, total: 5 });
  });
});

describe("any time ends when quiet hours start", () => {
  test("not overdue before quiet hours", () => {
    const f = pickFocus([task({ title: "Read", dueAt: at("2026-10-06T23:59:00"), anyTimeEndsAt: at("2026-10-06T22:00:00") })], at("2026-10-06T21:00:00"));
    expect(f.top[0]!.overdue).toBe(false);
  });
  test("overdue once they start, and ranked with the overdue", () => {
    const late = at("2026-10-06T22:30:00");
    const f = pickFocus([
      task({ title: "Email", dueAt: at("2026-10-06T23:30:00") }),
      task({ title: "Read", dueAt: at("2026-10-06T23:59:00"), anyTimeEndsAt: at("2026-10-06T22:00:00") }),
    ], late);
    expect(titles(f.top)).toEqual(["Read", "Email"]);
    expect(f.top[0]!.overdue).toBe(true);
  });
  test("yesterday's any-time habit (no time) is overdue today", () => {
    const f = pickFocus([task({ title: "Pray", dueAt: null, anyTimeEndsAt: at("2026-10-05T22:00:00") })], now);
    expect(f.top[0]!.overdue).toBe(true);
  });
});

describe("priority", () => {
  test("high comes before normal, low after, within a group — before time", () => {
    const f = pickFocus([
      task({ title: "Inbox", dueAt: at("2026-10-06T11:00:00") }),
      task({ title: "Tidy desk", dueAt: null, priority: "low" }),
      task({ title: "Pitch deck", dueAt: null, priority: "high" }),
      task({ title: "Call bank", dueAt: null }),
    ], now, 4);
    expect(titles(f.top)).toEqual(["Pitch deck", "Inbox", "Call bank", "Tidy desk"]);
  });

  test("a must-do still outranks a high-priority ordinary task", () => {
    const f = pickFocus([
      task({ title: "Pitch deck", priority: "high" }),
      task({ title: "Pray", isNonNegotiable: true, priority: "low" }),
    ], now);
    expect(titles(f.top)).toEqual(["Pray", "Pitch deck"]);
  });

  test("an overdue normal task comes after an upcoming high one (priority before time)", () => {
    const f = pickFocus([
      task({ title: "Late email", dueAt: at("2026-10-06T08:00:00") }),
      task({ title: "Pitch deck", dueAt: at("2026-10-06T10:40:00"), priority: "high" }),
    ], now);
    expect(titles(f.top)).toEqual(["Pitch deck", "Late email"]);
  });

  test("it comes through on the item", () => {
    expect(pickFocus([task({ priority: "high" })], now).top[0]!.priority).toBe("high");
  });
});

describe("later: a set time more than an hour away waits", () => {
  const morning = at("2026-10-06T08:00:00");
  const routineStep = (n: number, time: string, status: TaskForFocus["status"] = "pending") =>
    task({ title: `Evening ${n}`, isNonNegotiable: true, dueAt: at(`2026-10-06T${time}:00`), status, routine: { id: "evening", title: "Evening routine", step: n } });

  test("an evening routine at 21:00 doesn't top the morning", () => {
    const f = pickFocus([routineStep(1, "21:00"), routineStep(2, "21:10"), task({ title: "Email", dueAt: null }), task({ title: "Report", dueAt: at("2026-10-06T08:30:00") })], morning);
    expect(titles(f.top)).toEqual(["Report", "Email", "Evening routine"]);
  });

  test("within the hour, it comes up as usual", () => {
    const f = pickFocus([routineStep(1, "21:00"), task({ title: "Email", dueAt: null })], at("2026-10-06T20:15:00"));
    expect(titles(f.top)).toEqual(["Evening routine", "Email"]);
  });

  test("a routine already under way stays up, whatever its next step's time", () => {
    const f = pickFocus([routineStep(1, "07:00", "done"), routineStep(2, "09:30"), task({ title: "Email", dueAt: null })], morning);
    expect(titles(f.top)).toEqual(["Evening routine", "Email"]);
  });

  test("a started task is never later", () => {
    const f = pickFocus([task({ title: "Deck", dueAt: at("2026-10-06T16:00:00"), startedAt: at("2026-10-06T07:50:00") }), task({ title: "Email", dueAt: null })], morning);
    expect(titles(f.top)).toEqual(["Deck", "Email"]);
  });

  test("an any-time task is never later", () => {
    const f = pickFocus([task({ title: "Read", dueAt: at("2026-10-06T23:59:00"), anyTimeEndsAt: at("2026-10-06T22:00:00") }), task({ title: "Pitch", dueAt: at("2026-10-06T15:00:00"), priority: "high" })], morning);
    expect(titles(f.top)).toEqual(["Read", "Pitch"]);
  });

  test("among later things, the usual order holds", () => {
    const f = pickFocus([task({ title: "Gym", dueAt: at("2026-10-06T18:00:00") }), task({ title: "Pray", isNonNegotiable: true, dueAt: at("2026-10-06T19:00:00") })], morning);
    expect(titles(f.top)).toEqual(["Pray", "Gym"]);
  });
});

describe("how soon is their setting", () => {
  test("with 3 hours, a task at 10:30 counts as now at 08:00, so a must-do ranks above an any-time task", () => {
    const tasks = [task({ title: "Email", dueAt: null }), task({ title: "Standup", isNonNegotiable: true, dueAt: at("2026-10-06T10:30:00") })];
    expect(titles(pickFocus(tasks, at("2026-10-06T08:00:00")).top)).toEqual(["Email", "Standup"]);
    expect(titles(pickFocus(tasks, at("2026-10-06T08:00:00"), 3, undefined, 180).top)).toEqual(["Standup", "Email"]);
  });
  test("0: only what's due now or overdue comes up", () => {
    const tasks = [task({ title: "Email", dueAt: null }), task({ title: "Standup", isNonNegotiable: true, dueAt: at("2026-10-06T08:05:00") })];
    expect(titles(pickFocus(tasks, at("2026-10-06T08:00:00"), 3, undefined, 0).top)).toEqual(["Email", "Standup"]);
  });
});
