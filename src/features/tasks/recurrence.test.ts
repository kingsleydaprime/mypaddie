import { describe, expect, test } from "bun:test";
import { firstOccurrence, InvalidRecurrenceError, occursOn, withUntil, parseRecurrence, planOccurrences, projectedOccurrences, type SeriesForSpawn, type SeriesTemplate } from "./recurrence";

const at = (local: string) => new Date(`${local}+01:00`);

describe("parseRecurrence", () => {
  test("daily, with or without the RRULE: prefix, any case", () => {
    expect(parseRecurrence("FREQ=DAILY")).toEqual({ freq: "daily" });
    expect(parseRecurrence("RRULE:freq=daily")).toEqual({ freq: "daily" });
  });

  test("weekly on given days", () => {
    const r = parseRecurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(r.freq).toBe("weekly");
    expect(r.freq === "weekly" && [...r.days].sort()).toEqual([1, 3, 5]);
  });

  test.each([
    "FREQ=MONTHLY",
    "FREQ=DAILY;INTERVAL=2",
    "FREQ=DAILY;COUNT=10",
    "FREQ=WEEKLY",
    "FREQ=WEEKLY;BYDAY=XX",
    "FREQ=DAILY;BYDAY=MO",
    "BYDAY=MO",
    "nonsense",
    "",
  ])("rejects %p", (rule) => {
    expect(() => parseRecurrence(rule)).toThrow(InvalidRecurrenceError);
  });
});

describe("occursOn", () => {
  test("weekly matches only listed weekdays", () => {
    const r = parseRecurrence("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(occursOn(r, "2026-10-05")).toBe(true); // Monday
    expect(occursOn(r, "2026-10-06")).toBe(false); // Tuesday
    expect(occursOn(r, "2026-10-07")).toBe(true); // Wednesday
  });
});

describe("planOccurrences", () => {
  const rhapsody: SeriesForSpawn = {
    seriesId: "s-rhapsody",
    rule: "FREQ=DAILY",
    lastOccursOn: "2026-10-05",
    lastDueAt: at("2026-10-05T07:00:00"),
  };

  test("nothing to do when today's row already exists", () => {
    expect(planOccurrences([rhapsody], at("2026-10-05T10:00:00"))).toEqual([]);
  });

  test("next morning: spawn today's row at the same wall-clock time", () => {
    expect(planOccurrences([rhapsody], at("2026-10-06T06:00:00"))).toEqual([
      { seriesId: "s-rhapsody", occursOn: "2026-10-06", dueAt: at("2026-10-06T07:00:00") },
    ]);
  });

  test("after a gap, backfills the missed days so ignored needs still count", () => {
    const plan = planOccurrences([rhapsody], at("2026-10-08T12:00:00"));
    expect(plan.map((p) => p.occursOn)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
  });

  test("backfill is capped — a long absence isn't a wall of deductions", () => {
    const plan = planOccurrences([rhapsody], at("2026-11-01T12:00:00"), 3);
    expect(plan.map((p) => p.occursOn)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  test("weekly habits only spawn on their days", () => {
    const gym: SeriesForSpawn = { ...rhapsody, seriesId: "s-gym", rule: "FREQ=WEEKLY;BYDAY=MO,TH" };
    // Last row Monday 10-05; now Sunday 10-11 → only Thursday 10-08.
    expect(planOccurrences([gym], at("2026-10-11T12:00:00")).map((p) => p.occursOn)).toEqual(["2026-10-08"]);
  });

  test("a habit with no due time spawns rows with no due time", () => {
    const anytime = { ...rhapsody, lastDueAt: null };
    expect(planOccurrences([anytime], at("2026-10-06T06:00:00"))).toEqual([
      { seriesId: "s-rhapsody", occursOn: "2026-10-06", dueAt: null },
    ]);
  });

  test("a late-evening habit keeps its local time, even though that's the next UTC day", () => {
    const brush = { ...rhapsody, lastDueAt: at("2026-10-05T23:30:00") };
    const [row] = planOccurrences([brush], at("2026-10-06T08:00:00"));
    expect(row!.dueAt!.toISOString()).toBe("2026-10-06T22:30:00.000Z");
  });

  test("uses the Lagos day: 00:30 Lagos on the 6th is already the 6th", () => {
    expect(planOccurrences([rhapsody], new Date("2026-10-05T23:30:00Z")).map((p) => p.occursOn)).toEqual([
      "2026-10-06",
    ]);
  });
});

describe("projectedOccurrences", () => {
  const reading: SeriesTemplate = { seriesId: "s1", title: "Reading", rule: "FREQ=DAILY", lastOccursOn: "2026-10-06", lastDueAt: at("2026-10-06T06:30:00"), durationMinutes: 30 };
  const gym: SeriesTemplate = { seriesId: "s2", title: "Gym", rule: "FREQ=WEEKLY;BYDAY=TU,TH", lastOccursOn: "2026-10-06", lastDueAt: at("2026-10-06T18:00:00"), durationMinutes: 60 };
  const anytime: SeriesTemplate = { seriesId: "s3", title: "Duolingo", rule: "FREQ=DAILY", lastOccursOn: "2026-10-06", lastDueAt: null, durationMinutes: 15 };

  test("a future day gets every habit that falls on it, at its usual time", () => {
    const thursday = projectedOccurrences([reading, gym, anytime], "2026-10-08");
    expect(thursday.map((o) => `${o.title}@${o.dueAt?.toISOString() ?? "any"}:${o.durationMinutes}`)).toEqual([
      "Reading@2026-10-08T05:30:00.000Z:30",
      "Gym@2026-10-08T17:00:00.000Z:60",
      "Duolingo@any:15",
    ]);
  });
  test("weekly habits only on their days", () => {
    expect(projectedOccurrences([gym], "2026-10-07").length).toBe(0); // Wednesday
  });
  test("days already created are real rows, not projected", () => {
    expect(projectedOccurrences([reading], "2026-10-06")).toEqual([]);
  });
});

describe("UNTIL", () => {
  test("parses a date, and stops after it", () => {
    const r = parseRecurrence("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261216");
    expect(r.until).toBe("2026-12-16");
    expect(occursOn(r, "2026-12-14")).toBe(true); // a Monday, before
    expect(occursOn(r, "2026-12-16")).toBe(true); // the last day itself
    expect(occursOn(r, "2026-12-21")).toBe(false); // a Monday, after
  });
  test("daily with an end, and the UTC timestamp form", () => {
    const r = parseRecurrence("FREQ=DAILY;UNTIL=20261020T235959Z");
    expect(occursOn(r, "2026-10-20")).toBe(true);
    expect(occursOn(r, "2026-10-21")).toBe(false);
  });
  test("nonsense UNTIL is refused", () => {
    expect(() => parseRecurrence("FREQ=DAILY;UNTIL=soon")).toThrow(InvalidRecurrenceError);
    expect(() => parseRecurrence("FREQ=DAILY;UNTIL=20261340")).toThrow(InvalidRecurrenceError);
  });
  test("withUntil adds, replaces and removes the end", () => {
    expect(withUntil("FREQ=WEEKLY;BYDAY=MO", "2027-01-31")).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20270131");
    expect(withUntil("FREQ=WEEKLY;BYDAY=MO;UNTIL=20270131", "2027-03-01")).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20270301");
    expect(withUntil("FREQ=DAILY;UNTIL=20270131", null)).toBe("FREQ=DAILY");
  });
  test("planOccurrences doesn't spawn days past the end", () => {
    const now = new Date("2026-12-20T09:00:00+01:00");
    const out = planOccurrences([{ seriesId: "s", rule: "FREQ=DAILY;UNTIL=20261218", lastOccursOn: "2026-12-15", lastDueAt: null }], now, 7);
    expect(out.map((o) => o.occursOn)).toEqual(["2026-12-16", "2026-12-17", "2026-12-18"]);
  });
});

describe("firstOccurrence", () => {
  // Wednesday 7 October 2026, 17:00.
  const now = { today: "2026-10-07", time: "17:00" };
  const tuesdays = parseRecurrence("FREQ=WEEKLY;BYDAY=TU");
  const daily = parseRecurrence("FREQ=DAILY");

  test("a Tuesday habit set up on a Wednesday starts next Tuesday", () => {
    expect(firstOccurrence(tuesdays, "2026-10-07", now, "16:00")).toBe("2026-10-13");
  });
  test("a daily habit whose time has passed starts tomorrow", () => {
    expect(firstOccurrence(daily, "2026-10-07", now, "06:00")).toBe("2026-10-08");
  });
  test("a daily habit later today starts today", () => {
    expect(firstOccurrence(daily, "2026-10-07", now, "19:00")).toBe("2026-10-07");
  });
  test("an any-time habit can still start today", () => {
    expect(firstOccurrence(daily, "2026-10-07", now, null)).toBe("2026-10-07");
  });
  test("exactly now counts as passed", () => {
    expect(firstOccurrence(daily, "2026-10-07", now, "17:00")).toBe("2026-10-08");
  });
  test("a future start date is respected, then matched to the rule", () => {
    expect(firstOccurrence(tuesdays, "2026-10-14", now, "16:00")).toBe("2026-10-20");
  });
  test("a start date in the past doesn't create past days", () => {
    expect(firstOccurrence(daily, "2026-10-01", now, null)).toBe("2026-10-07");
    expect(firstOccurrence(tuesdays, "2026-08-01", now, "16:00")).toBe("2026-10-13");
  });
  test("a rule that ends before it ever happens: null", () => {
    expect(firstOccurrence(parseRecurrence("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261010"), "2026-10-07", now, "16:00")).toBeNull();
  });
});
