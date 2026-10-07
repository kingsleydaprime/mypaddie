import { describe, expect, test } from "bun:test";
import { parseRecurrence } from "@/features/tasks/recurrence";
import { assessLoad, verdictFor, weeklyMinutes, type CommitmentLoad } from "./commitments";

const c = (title: string, priority: CommitmentLoad["priority"], scheduledMinutes: number, extraMinutes = 0): CommitmentLoad => ({
  id: title, title, priority, scheduledMinutes, extraMinutes,
});
const WEEK = 7 * 360; // default 6h a day

describe("weeklyMinutes", () => {
  test("weekly sessions: days × length", () => {
    expect(weeklyMinutes(parseRecurrence("FREQ=WEEKLY;BYDAY=TU,TH"), 120)).toBe(240);
  });
  test("daily: 7 × length", () => {
    expect(weeklyMinutes(parseRecurrence("FREQ=DAILY"), 30)).toBe(210);
  });
  test("no length: the default 30 minutes", () => {
    expect(weeklyMinutes(parseRecurrence("FREQ=WEEKLY;BYDAY=SA"), null)).toBe(30);
  });
});

describe("verdictFor", () => {
  test("room below 80%, tight from 80% to 100%, overloaded above", () => {
    expect(verdictFor(0.79)).toBe("room");
    expect(verdictFor(0.8)).toBe("tight");
    expect(verdictFor(1)).toBe("tight");
    expect(verdictFor(1.01)).toBe("overloaded");
  });
});

describe("assessLoad", () => {
  test("adds unscheduled estimates to what's on the days", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 1000, commitments: [c("Freelance", "important", 0, 300)] });
    expect(load).toMatchObject({ scheduled: 1000, extra: 300, total: 1300, verdict: "room" });
    expect(load.dropCandidates).toEqual([]);
  });
  test("the rest of the week is what isn't tied to a commitment", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 1000, commitments: [c("Team", "important", 240), c("Choir", "optional", 120)] });
    expect(load.other).toBe(640);
    expect(load.byCommitment.map((x) => x.title)).toEqual(["Team", "Choir"]);
  });
  test("tight: drop candidates appear", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 2100, commitments: [c("Team", "important", 240), c("Choir", "optional", 120)] });
    expect(load.verdict).toBe("tight");
    expect(load.dropCandidates.map((d) => d.title)).toEqual(["Choir", "Team"]);
  });
  test("optional before important, biggest relief first; core never", () => {
    const load = assessLoad({
      capacity: WEEK,
      scheduled: 2600,
      commitments: [c("Job", "core", 1200), c("Ambassador", "optional", 120), c("Union", "optional", 300), c("Team", "important", 400)],
    });
    expect(load.verdict).toBe("overloaded");
    expect(load.dropCandidates.map((d) => d.title)).toEqual(["Union", "Ambassador", "Team"]);
  });
  test("marks where dropping is enough to get back to room", () => {
    // 2600 total, room line = 2016: need to free 585+.
    const load = assessLoad({ capacity: WEEK, scheduled: 2600, commitments: [c("Union", "optional", 300), c("Ambassador", "optional", 120), c("Team", "important", 400)] });
    expect(load.dropCandidates.map((d) => [d.title, d.enough])).toEqual([
      ["Union", false],
      ["Ambassador", false],
      ["Team", true],
    ]);
  });
  test("checks a new commitment before it's added", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 1800, commitments: [c("Choir", "optional", 180)], adding: 300 });
    expect(load.verdict).toBe("room"); // 71% now…
    expect(load.after).toEqual({ adding: 300, total: 2100, ratio: 2100 / WEEK, verdict: "tight" }); // …83% after
    expect(load.dropCandidates.map((d) => d.title)).toEqual(["Choir"]);
  });
  test("room now and after: no advice to drop anything", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 600, commitments: [c("Choir", "optional", 180)], adding: 120 });
    expect(load.after?.verdict).toBe("room");
    expect(load.dropCandidates).toEqual([]);
  });
  test("zero capacity (a week off): anything at all is overloaded", () => {
    expect(assessLoad({ capacity: 0, scheduled: 60, commitments: [] }).verdict).toBe("overloaded");
    expect(assessLoad({ capacity: 0, scheduled: 0, commitments: [] }).verdict).toBe("room");
  });
  test("commitments with nothing scheduled aren't suggested for dropping", () => {
    const load = assessLoad({ capacity: WEEK, scheduled: 2500, commitments: [c("Old club", "optional", 0)] });
    expect(load.dropCandidates).toEqual([]);
  });
});
