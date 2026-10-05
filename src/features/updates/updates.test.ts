import { describe, expect, test } from "bun:test";
import { buildDigest, draftSince } from "./updates";

const at = (local: string) => new Date(`${local}+01:00`);

describe("draftSince", () => {
  test("from the last update sent", () => {
    expect(draftSince(at("2026-10-02T16:00:00"), at("2026-10-09T15:00:00"))).toEqual(at("2026-10-02T16:00:00"));
  });
  test("never sent: the last 7 days", () => {
    expect(draftSince(null, at("2026-10-09T15:00:00"))).toEqual(at("2026-10-02T15:00:00"));
  });
});

describe("buildDigest", () => {
  test("groups and orders the week", () => {
    const d = buildDigest({
      tasks: [
        { title: "Ship auth endpoints", doneAt: at("2026-10-07T12:00:00") },
        { title: "Fix login bug", doneAt: at("2026-10-05T12:00:00") },
        { title: "Update: Tobi", doneAt: at("2026-10-02T16:00:00") },
        { title: "Fix login bug", doneAt: at("2026-10-06T12:00:00") },
      ],
      learning: [
        { skill: "DSA", topic: "sliding window", minutes: 45 },
        { skill: "DSA", topic: "graphs", minutes: 60 },
        { skill: "Spanish", topic: null, minutes: 20 },
        { skill: "DSA", topic: "sliding window", minutes: 30 },
      ],
      workouts: [{ at: at("2026-10-06T18:00:00"), minutes: 55 }, { at: at("2026-10-08T18:00:00"), minutes: null }],
      applications: [{ title: "Scholarship X", status: "submitted", at: at("2026-10-08T10:00:00") }],
    });
    expect(d).toEqual({
      completed: ["Fix login bug", "Ship auth endpoints"],
      learning: [
        { skill: "DSA", minutes: 135, topics: ["sliding window", "graphs"] },
        { skill: "Spanish", minutes: 20, topics: [] },
      ],
      workouts: { sessions: 2, minutes: 55 },
      applications: ["Scholarship X: submitted"],
      isEmpty: false,
    });
  });
  test("sending an update isn't itself news", () => {
    expect(buildDigest({ tasks: [{ title: "Update: Tobi", doneAt: at("2026-10-02T16:00:00") }], learning: [], workouts: [], applications: [] }).isEmpty).toBe(true);
  });
  test("an empty week is reported as empty, not padded", () => {
    expect(buildDigest({ tasks: [], learning: [], workouts: [], applications: [] })).toMatchObject({ isEmpty: true, completed: [] });
  });
});
