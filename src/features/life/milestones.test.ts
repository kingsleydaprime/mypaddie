import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import { canAchieve, milestoneXp, timeline, type TimelineEntry } from "./milestones";

const e = (id: string, status: TimelineEntry["status"], date: string | null, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id, kind: "moment", title: id, status, date, item: null, before: null, after: null, ...extra,
});

describe("milestoneXp", () => {
  test("3× the base, split by weight", () => {
    expect(milestoneXp(20, [{ pillar: "skills", weight: 50 }, { pillar: "academic", weight: 50 }], DEFAULT_CONFIG)).toEqual([
      { pillar: "skills", amount: 30, reason: "dream_milestone" },
      { pillar: "academic", amount: 30, reason: "dream_milestone" },
    ]);
  });
  test("only a planned milestone can be hit", () => {
    expect(canAchieve("planned")).toBe(true);
    expect(canAchieve("achieved")).toBe(false);
    expect(canAchieve("dropped")).toBe(false);
  });
});

describe("timeline", () => {
  const today = "2026-10-07";
  const t = timeline([
    e("First job", "achieved", "2024-06-01"),
    e("Graduated", "achieved", "2023-11-20"),
    e("Someday: own a house", "planned", null),
    e("Ship MyPaddie", "planned", "2026-12-01"),
    e("Late one", "planned", "2026-09-01"),
    e("Dropped", "dropped", "2025-01-01"),
  ], today);
  test("happened first (oldest first), then planned by date, someday last; dropped left out", () => {
    expect(t.map((x) => x.title)).toEqual(["Graduated", "First job", "Late one", "Ship MyPaddie", "Someday: own a house"]);
  });
  test("each knows when it sits", () => {
    expect(t.map((x) => x.when)).toEqual(["past", "past", "overdue", "ahead", "someday"]);
  });
  test("and what came before and after", () => {
    expect(t[1]).toMatchObject({ previous: "Graduated", next: "Late one" });
    expect(t[0]!.previous).toBeNull();
    expect(t.at(-1)!.next).toBeNull();
  });
});
