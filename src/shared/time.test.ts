import { describe, expect, test } from "bun:test";
import { addDays, dayKey, daysBetween, localTimeOf, startOfNextDay, weekdayOf, withinLastDays, zonedInstant } from "./time";

const LAGOS = "Africa/Lagos"; // UTC+1, no DST
const at = (iso: string) => new Date(iso);

describe("dayKey", () => {
  test("uses the local day, not the UTC day", () => {
    // 23:30 UTC on the 4th is already 00:30 on the 5th in Lagos.
    expect(dayKey(at("2026-10-04T23:30:00Z"), LAGOS)).toBe("2026-10-05");
    expect(dayKey(at("2026-10-04T22:59:59Z"), LAGOS)).toBe("2026-10-04");
  });
});

describe("daysBetween", () => {
  test("counts calendar days, not 24-hour blocks", () => {
    // 23:00 → 01:00 next day is two hours but one calendar day.
    expect(daysBetween(at("2026-10-05T23:00:00+01:00"), at("2026-10-06T01:00:00+01:00"), LAGOS)).toBe(1);
  });
  test("same day is zero, earlier is negative", () => {
    const morning = at("2026-10-05T06:00:00+01:00");
    const night = at("2026-10-05T23:00:00+01:00");
    expect(daysBetween(morning, night, LAGOS)).toBe(0);
    expect(daysBetween(night, at("2026-10-03T12:00:00+01:00"), LAGOS)).toBe(-2);
  });
  test("crosses month and year boundaries", () => {
    expect(daysBetween(at("2026-12-31T12:00:00+01:00"), at("2027-01-01T12:00:00+01:00"), LAGOS)).toBe(1);
  });
});

describe("withinLastDays", () => {
  const now = at("2026-10-07T12:00:00+01:00");
  test("today counts as day 1 of the window", () => {
    expect(withinLastDays(at("2026-10-07T00:00:00+01:00"), now, 1, LAGOS)).toBe(true);
    expect(withinLastDays(at("2026-10-06T23:59:00+01:00"), now, 1, LAGOS)).toBe(false);
  });
  test("a 3-day window covers today and the two days before", () => {
    expect(withinLastDays(at("2026-10-05T00:00:00+01:00"), now, 3, LAGOS)).toBe(true);
    expect(withinLastDays(at("2026-10-04T23:59:00+01:00"), now, 3, LAGOS)).toBe(false);
  });
  test("future instants are outside the window", () => {
    expect(withinLastDays(at("2026-10-08T09:00:00+01:00"), now, 7, LAGOS)).toBe(false);
  });
});

describe("startOfNextDay", () => {
  test("is local midnight of the following day", () => {
    expect(startOfNextDay(at("2026-10-05T14:37:12+01:00"), LAGOS).toISOString()).toBe(
      "2026-10-05T23:00:00.000Z",
    );
  });
  test("from exactly midnight, it is the next midnight", () => {
    expect(startOfNextDay(at("2026-10-05T00:00:00+01:00"), LAGOS).toISOString()).toBe(
      "2026-10-05T23:00:00.000Z",
    );
  });
  test("handles a 23-hour DST day", () => {
    // London springs forward on 2026-03-29: the day after starts at 23:00 UTC.
    expect(startOfNextDay(at("2026-03-29T10:00:00Z"), "Europe/London").toISOString()).toBe(
      "2026-03-29T23:00:00.000Z",
    );
  });
});

describe("addDays / weekdayOf", () => {
  test("crosses month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
  test("2026-10-05 is a Monday", () => {
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(weekdayOf("2026-10-11")).toBe(0);
  });
});

describe("localTimeOf / zonedInstant", () => {
  test("Lagos is UTC+1", () => {
    expect(localTimeOf(new Date("2026-10-06T06:00:00Z"), LAGOS)).toBe("07:00");
    expect(zonedInstant("2026-10-06", "07:00", LAGOS).toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });
  test("just after local midnight is the previous UTC day", () => {
    expect(zonedInstant("2026-10-06", "00:30", LAGOS).toISOString()).toBe("2026-10-05T23:30:00.000Z");
  });
  test("round-trips through localTimeOf", () => {
    const at = zonedInstant("2026-10-06", "21:45", LAGOS);
    expect(localTimeOf(at, LAGOS)).toBe("21:45");
    expect(dayKey(at, LAGOS)).toBe("2026-10-06");
  });
  test("respects DST in zones that have it", () => {
    // London is UTC+1 in summer, UTC+0 in winter.
    expect(zonedInstant("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedInstant("2026-12-01", "09:00", "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});
