import { describe, expect, test } from "bun:test";
import { dayLabel, describeRecurrence, summariseSeries, type SeriesRow } from "./overview";

const at = (local: string) => new Date(`${local}+01:00`);
/** Thursday morning, Lagos. */
const now = at("2026-10-08T07:30:00");

let n = 0;
function row(overrides: Partial<SeriesRow> & Pick<SeriesRow, "seriesId" | "occursOn">): SeriesRow {
  n += 1;
  return { id: `r${n}`, title: overrides.seriesId, recurrence: "FREQ=DAILY", dueAt: null, status: "pending", routine: null, ...overrides };
}

/** One routine step's row on a day, timed. */
const step = (routine: string, s: number, day: string, time: string, status: SeriesRow["status"] = "pending") =>
  row({ seriesId: `${routine}-${s}`, title: `step ${s}`, occursOn: day, dueAt: at(`${day}T${time}:00`), status, routine: { id: routine, step: s } });

describe("describeRecurrence", () => {
  test.each([
    ["FREQ=DAILY", "Every day"],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Weekdays"],
    ["FREQ=WEEKLY;BYDAY=SA,SU", "Weekends"],
    ["FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA", "Every day"],
    ["FREQ=WEEKLY;BYDAY=FR,MO,WE", "Mon, Wed, Fri"],
    ["FREQ=WEEKLY;BYDAY=SU", "Sun"],
    ["FREQ=DAILY;UNTIL=20270131", "Every day until 31 Jan"],
  ])("%s → %s", (rule, label) => {
    expect(describeRecurrence(rule)).toBe(label);
  });

  test("a rule it can't read comes back as written, rather than throwing on the page", () => {
    expect(describeRecurrence("FREQ=MONTHLY")).toBe("FREQ=MONTHLY");
  });
});

describe("dayLabel", () => {
  test.each([
    ["2026-10-08", "Today"],
    ["2026-10-09", "Tomorrow"],
    ["2026-10-12", "Mon"],
    ["2026-10-14", "Wed"],
    ["2026-10-15", "Thu 15 Oct"],
    ["2026-10-07", "Wed 7 Oct"],
  ])("%s → %s", (day, label) => {
    expect(dayLabel(day, "2026-10-08")).toBe(label);
  });
});

describe("routines", () => {
  test("set up after its start time, it shows when it starts — not nothing", () => {
    const rows = [step("m", 1, "2026-10-09", "06:00"), step("m", 2, "2026-10-09", "06:10")];
    const [r] = summariseSeries(rows, [{ id: "m", title: "Morning" }], now).routines;
    expect(r).toMatchObject({ title: "Morning", steps: ["step 1", "step 2"], rule: "Every day", today: null, next: { day: "2026-10-09", time: "06:00" } });
  });

  test("in progress today: how far, and the next step in order", () => {
    const rows = [step("m", 1, "2026-10-08", "06:00", "done"), step("m", 2, "2026-10-08", "06:10"), step("m", 3, "2026-10-08", "06:20")];
    const [r] = summariseSeries(rows, [{ id: "m", title: "Morning" }], now).routines;
    expect(r!.today).toEqual({ done: 1, total: 3, nextStep: "step 2", nextId: rows[1]!.id });
    expect(r!.next).toBeNull();
  });

  test("a skipped step is still next — it's open, not finished", () => {
    const rows = [step("m", 1, "2026-10-08", "06:00", "skipped"), step("m", 2, "2026-10-08", "06:10")];
    const [r] = summariseSeries(rows, [{ id: "m", title: "Morning" }], now).routines;
    expect(r!.today).toMatchObject({ done: 0, nextStep: "step 1" });
  });

  test("all done today: when it comes round again, from its first step's time", () => {
    const rows = [step("m", 1, "2026-10-08", "06:00", "done"), step("m", 2, "2026-10-08", "06:10", "done")];
    const [r] = summariseSeries(rows, [{ id: "m", title: "Morning" }], now).routines;
    expect(r!.today).toMatchObject({ done: 2, total: 2, nextStep: null, nextId: null });
    expect(r!.next).toEqual({ day: "2026-10-09", time: "06:00" });
  });

  test("a cancelled step doesn't count towards today's total", () => {
    const rows = [step("m", 1, "2026-10-08", "06:00", "done"), step("m", 2, "2026-10-08", "06:10", "cancelled")];
    const [r] = summariseSeries(rows, [{ id: "m", title: "Morning" }], now).routines;
    expect(r!.today).toMatchObject({ done: 1, total: 1 });
  });

  test("a routine with no steps still shows, with nothing scheduled", () => {
    const [r] = summariseSeries([], [{ id: "e", title: "Evening" }], now).routines;
    expect(r).toEqual({ id: "e", title: "Evening", rule: null, steps: [], today: null, next: null });
  });

  test("going today first, then by when they start, empty last", () => {
    const rows = [
      step("later", 1, "2026-10-10", "06:00"),
      step("soon", 1, "2026-10-09", "21:00"),
      step("now", 1, "2026-10-08", "08:00"),
    ];
    const routines = ["empty", "later", "soon", "now"].map((id) => ({ id, title: id }));
    expect(summariseSeries(rows, routines, now).routines.map((r) => r.id)).toEqual(["now", "soon", "later", "empty"]);
  });

  test("routine steps don't also show as habits", () => {
    const { habits } = summariseSeries([step("m", 1, "2026-10-08", "06:00")], [{ id: "m", title: "Morning" }], now);
    expect(habits).toEqual([]);
  });
});

describe("habits", () => {
  test("the open row today is next, and is what you tap", () => {
    const r = row({ seriesId: "water", occursOn: "2026-10-08", dueAt: at("2026-10-08T09:00:00") });
    expect(summariseSeries([r], [], now).habits).toEqual([{ seriesId: "water", title: "water", rule: "Every day", next: { day: "2026-10-08", time: "09:00" }, openId: r.id, selfCare: false }]);
  });

  test("done this week, a weekly habit is next on its next day", () => {
    const r = row({ seriesId: "gym", recurrence: "FREQ=WEEKLY;BYDAY=MO", occursOn: "2026-10-05", dueAt: at("2026-10-05T17:00:00"), status: "done" });
    expect(summariseSeries([r], [], now).habits[0]).toMatchObject({ rule: "Mon", next: { day: "2026-10-12", time: "17:00" }, openId: null });
  });

  test("an any-time habit (stored at 23:59) has no time", () => {
    const r = row({ seriesId: "read", occursOn: "2026-10-08", dueAt: at("2026-10-08T23:59:00") });
    expect(summariseSeries([r], [], now).habits[0]!.next).toEqual({ day: "2026-10-08", time: null });
  });

  test("past its UNTIL date, it has no next day", () => {
    const r = row({ seriesId: "class", recurrence: "FREQ=DAILY;UNTIL=20261008", occursOn: "2026-10-08", status: "done" });
    expect(summariseSeries([r], [], now).habits[0]!.next).toBeNull();
  });

  test("today's already-past time still counts as today while it's open (it's overdue, not gone)", () => {
    const r = row({ seriesId: "pray", occursOn: "2026-10-08", dueAt: at("2026-10-08T06:00:00") });
    expect(summariseSeries([r], [], now).habits[0]!.next).toEqual({ day: "2026-10-08", time: "06:00" });
  });

  test("soonest first; one with no next day goes last", () => {
    const rows = [
      row({ seriesId: "b", occursOn: "2026-10-08", dueAt: at("2026-10-08T20:00:00") }),
      row({ seriesId: "gone", recurrence: "FREQ=DAILY;UNTIL=20261008", occursOn: "2026-10-08", status: "done" }),
      row({ seriesId: "a", occursOn: "2026-10-08", dueAt: at("2026-10-08T08:00:00") }),
      row({ seriesId: "anytime", occursOn: "2026-10-08", dueAt: null }),
    ];
    expect(summariseSeries(rows, [], now).habits.map((h) => h.seriesId)).toEqual(["a", "b", "anytime", "gone"]);
  });
});

test("a habit says whether it's self-care", () => {
  const r = row({ seriesId: "church", recurrence: "FREQ=WEEKLY;BYDAY=SU", occursOn: "2026-10-04", status: "done", selfCare: true });
  expect(summariseSeries([r], [], now).habits[0]).toMatchObject({ selfCare: true, next: { day: "2026-10-11" } });
});
