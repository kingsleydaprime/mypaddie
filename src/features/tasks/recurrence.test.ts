import { describe, expect, test } from "bun:test";
import { InvalidRecurrenceError, occursOn, parseRecurrence, planOccurrences, projectedOccurrences, type SeriesForSpawn, type SeriesTemplate } from "./recurrence";

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
