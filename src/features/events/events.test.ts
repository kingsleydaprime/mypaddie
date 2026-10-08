import { describe, expect, test } from "bun:test";
import { blockOn, EVENT_KINDS, eventEnds, inProgress, nextOccurrence, quadrant, selfCareByDefault, startable, upcoming, type EventLike } from "./events";

const at = (local: string) => new Date(`${local}+01:00`);
let n = 0;
const ev = (o: Partial<EventLike>): EventLike => ({
  id: `e${++n}`,
  title: `event ${n}`,
  kind: "other",
  startsAt: at("2026-10-20T18:00:00"),
  endsAt: null,
  allDay: false,
  important: false,
  yearly: false,
  status: "upcoming",
  ...o,
});

describe("nextOccurrence (same cases as the SQL)", () => {
  test("one-off: its own time", () => {
    expect(nextOccurrence(ev({}), "2026-10-06")).toEqual(at("2026-10-20T18:00:00"));
  });
  test("yearly: this year's date", () => {
    expect(nextOccurrence(ev({ startsAt: at("1999-11-02T00:00:00"), yearly: true }), "2026-10-06")).toEqual(at("2026-11-02T00:00:00"));
  });
  test("yearly: next year once passed", () => {
    expect(nextOccurrence(ev({ startsAt: at("1999-03-15T00:00:00"), yearly: true }), "2026-10-06")).toEqual(at("2027-03-15T00:00:00"));
  });
  test("29 Feb: the 28th in other years, the 29th in leap years", () => {
    const leapling = ev({ startsAt: at("2000-02-29T00:00:00"), yearly: true });
    expect(nextOccurrence(leapling, "2026-10-06")).toEqual(at("2027-02-28T00:00:00"));
    expect(nextOccurrence(leapling, "2027-03-01")).toEqual(at("2028-02-29T00:00:00"));
  });
  test("today counts", () => {
    expect(nextOccurrence(ev({ startsAt: at("1999-10-06T00:00:00"), yearly: true }), "2026-10-06")).toEqual(at("2026-10-06T00:00:00"));
  });
});

describe("quadrant", () => {
  test.each([
    [true, 3, "prepare_now"],
    [true, 7, "prepare_now"],
    [true, 8, "plan_ahead"],
    [false, 0, "fit_in"],
    [false, 30, "someday"],
  ] as const)("important=%p, %p days away → %p", (important, days, q) => {
    expect(quadrant(important, days)).toBe(q);
  });
});

describe("upcoming", () => {
  const now = at("2026-10-06T12:00:00");
  test("sorted by occurrence, within the horizon, with quadrants", () => {
    const list = upcoming(
      [
        ev({ title: "Wedding", startsAt: at("2026-11-21T11:00:00"), important: true }),
        ev({ title: "Interview", startsAt: at("2026-10-09T14:00:00"), important: true }),
        ev({ title: "Game night", startsAt: at("2026-10-07T19:00:00") }),
        ev({ title: "Far party", startsAt: at("2027-01-01T20:00:00") }),
        ev({ title: "Cancelled", startsAt: at("2026-10-08T10:00:00"), status: "cancelled" }),
      ],
      now,
      60,
    );
    expect(list.map((v) => `${v.title}:${v.quadrant}:${v.daysAway}`)).toEqual([
      "Game night:fit_in:1",
      "Interview:prepare_now:3",
      "Wedding:plan_ahead:46",
    ]);
  });
  test("an event that already started more than an hour ago today drops off; all-day ones stay all day", () => {
    const list = upcoming(
      [ev({ title: "Breakfast", startsAt: at("2026-10-06T08:00:00") }), ev({ title: "Tolu's birthday", startsAt: at("1999-10-06T00:00:00"), allDay: true, yearly: true })],
      now,
      7,
    );
    expect(list.map((v) => v.title)).toEqual(["Tolu's birthday"]);
  });
});

describe("blockOn", () => {
  test("a timed event blocks its time on its day", () => {
    expect(blockOn(ev({ startsAt: at("2026-10-20T09:00:00"), endsAt: at("2026-10-20T10:30:00") }), "2026-10-20")).toEqual({
      start: at("2026-10-20T09:00:00"),
      minutes: 90,
    });
  });
  test("no end → an hour", () => {
    expect(blockOn(ev({}), "2026-10-20")!.minutes).toBe(60);
  });
  test("other days, all-day and cancelled events block nothing", () => {
    expect(blockOn(ev({}), "2026-10-21")).toBeNull();
    expect(blockOn(ev({ allDay: true }), "2026-10-20")).toBeNull();
    expect(blockOn(ev({ status: "cancelled" }), "2026-10-20")).toBeNull();
  });
  test("a yearly timed event blocks its slot each year", () => {
    expect(blockOn(ev({ startsAt: at("2020-12-24T19:00:00"), yearly: true }), "2026-12-24")!.start).toEqual(at("2026-12-24T19:00:00"));
  });
});

describe("selfCareByDefault", () => {
  test("time with people you love starts as self-care", () => {
    expect(EVENT_KINDS.filter(selfCareByDefault)).toEqual(["social", "birthday", "anniversary", "wedding"]);
  });
  test("meetings, appointments, deadlines and exams start as work", () => {
    for (const k of ["meeting", "appointment", "deadline", "exam", "other"] as const) expect(selfCareByDefault(k)).toBe(false);
  });
});

describe("events in progress", () => {
  const at = (local: string) => new Date(`${local}+01:00`);
  const meeting = (over: Partial<EventLike & { startedAt: Date | null }> = {}): EventLike & { startedAt: Date | null } => ({
    id: "m", title: "Supervisor call", kind: "meeting", startsAt: at("2026-10-06T20:00:00"), endsAt: at("2026-10-06T21:00:00"),
    allDay: false, important: false, yearly: false, status: "upcoming", startedAt: null, ...over,
  });

  test("only a one-off with a time can be started", () => {
    expect(startable(meeting())).toBe(true);
    expect(startable(meeting({ allDay: true }))).toBe(false);
    expect(startable(meeting({ yearly: true }))).toBe(false);
    expect(startable(meeting({ status: "done" }))).toBe(false);
  });
  test("before its time: not yet", () => {
    expect(inProgress(meeting(), at("2026-10-06T19:59:00"))).toBeNull();
  });
  test("once its time comes, it's in progress by itself, until it ends", () => {
    expect(inProgress(meeting(), at("2026-10-06T20:00:00"))).toEqual({ since: at("2026-10-06T20:00:00"), until: at("2026-10-06T21:00:00") });
    expect(inProgress(meeting(), at("2026-10-06T21:00:00"))).toBeNull();
  });
  test("started early: in progress from then", () => {
    expect(inProgress(meeting({ startedAt: at("2026-10-06T19:50:00") }), at("2026-10-06T19:55:00"))).toMatchObject({ since: at("2026-10-06T19:50:00") });
  });
  test("with no end time, it's an hour", () => {
    expect(eventEnds(meeting({ endsAt: null }))).toEqual(at("2026-10-06T21:00:00"));
  });
  test("done or cancelled: not in progress", () => {
    expect(inProgress(meeting({ status: "done" }), at("2026-10-06T20:30:00"))).toBeNull();
    expect(inProgress(meeting({ status: "cancelled" }), at("2026-10-06T20:30:00"))).toBeNull();
  });
});
