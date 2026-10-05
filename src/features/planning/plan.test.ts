import { describe, expect, test } from "bun:test";
import { localTimeOf } from "@/shared/time";
import { planDay, type FixedBlock, type FlexibleTask } from "./plan";

const at = (local: string) => new Date(`${local}+01:00`);
const t = (local: Date) => localTimeOf(local, "Africa/Lagos");
const day = "2026-10-07";
const before = at("2026-10-06T22:00:00"); // planning tomorrow from the night before

let n = 0;
const task = (title: string, minutes: number, o: Partial<FlexibleTask> = {}): FlexibleTask => ({ id: `t${++n}`, title, minutes, must: false, need: false, chore: false, ...o });
const fixed = (title: string, start: string, minutes: number, kind: FixedBlock["kind"] = "event"): FixedBlock => ({ id: `f${++n}`, title, start: at(`${day}T${start}:00`), minutes, kind });
const outline = (p: ReturnType<typeof planDay>) => p.slots.map((s) => `${t(s.start)}-${t(s.end)} ${s.kind}:${s.title}`);

describe("planDay", () => {
  test("an empty day: meals at their usual times, and the biggest gap is free time", () => {
    expect(outline(planDay({ day, now: before, fixed: [], flexible: [] }))).toEqual([
      "08:00-08:20 meal:Breakfast",
      "13:00-13:30 meal:Lunch",
      "13:30-19:00 free:Free time",
      "19:00-19:40 meal:Dinner",
    ]);
  });

  test("fixed blocks stay, tasks fill gaps by priority, 5 minutes apart", () => {
    const plan = planDay({
      day,
      now: before,
      fixed: [fixed("Standup", "09:00", 60)],
      flexible: [task("Side project", 60), task("Reading", 30, { must: true }), task("Groceries", 45, { need: true })],
    });
    expect(outline(plan).filter((s) => !s.includes("free:"))).toEqual([
      "07:00-07:30 task:Reading",
      "08:00-08:20 meal:Breakfast",
      "09:00-10:00 event:Standup",
      "10:05-10:50 task:Groceries",
      "10:55-11:55 task:Side project",
      "13:00-13:30 meal:Lunch",
      "19:00-19:40 meal:Dinner",
    ]);
    expect(plan.assignments.map((a) => t(a.start))).toEqual(["07:00", "10:05", "10:55"]);
  });

  test("a meal moves out of the way of a fixed block, within an hour", () => {
    const plan = planDay({ day, now: before, fixed: [fixed("Long call", "12:30", 60)], flexible: [] });
    const lunch = plan.slots.find((s) => s.title === "Lunch")!;
    expect(`${t(lunch.start)}-${t(lunch.end)}`).toBe("13:30-14:00");
  });

  test("chores are batched into one block after the real work", () => {
    const plan = planDay({
      day,
      now: before,
      fixed: [],
      flexible: [task("Dishes", 15, { chore: true }), task("Study", 120), task("Laundry", 30, { chore: true })],
    });
    const chores = plan.slots.find((s) => s.kind === "chores")!;
    expect(chores.title).toBe("Chores: Dishes, Laundry");
    // Five minutes after the real work ends.
    expect(chores.start.getTime() - plan.slots.find((s) => s.title === "Study")!.end.getTime()).toBe(5 * 60_000);
    expect(plan.assignments.filter((a) => chores.taskIds.includes(a.taskId)).map((a) => t(a.start))).toEqual([t(chores.start), t(new Date(chores.start.getTime() + 15 * 60_000))]);
  });

  test("planning today starts from now", () => {
    const plan = planDay({ day, now: at(`${day}T15:02:00`), fixed: [], flexible: [task("Essay", 60)] });
    expect(plan.slots.some((s) => s.title === "Breakfast" || s.title === "Lunch")).toBe(false);
    expect(t(plan.assignments[0]!.start)).toBe("15:05");
  });

  test("what doesn't fit is reported, never squeezed in", () => {
    const plan = planDay({ day, now: at(`${day}T20:30:00`), fixed: [], flexible: [task("Big project", 180), task("Quick email", 15)] });
    expect(plan.unplaced.map((u) => u.title)).toEqual(["Big project"]);
    expect(plan.assignments).toHaveLength(1);
  });

  test("free time is the biggest gap after the work, if it's at least 45 minutes", () => {
    const plan = planDay({ day, now: before, fixed: [fixed("Dinner party", "19:30", 150)], flexible: [task("Study", 240, { must: true })] });
    const free = plan.slots.filter((s) => s.kind === "free");
    expect(free).toHaveLength(1);
    expect(free[0]!.start.getTime()).toBeGreaterThanOrEqual(plan.slots.find((s) => s.title === "Study")!.end.getTime());
  });

  test("no free time when the day is packed", () => {
    const plan = planDay({ day, now: at(`${day}T19:00:00`), fixed: [fixed("Event", "19:00", 180)], flexible: [] });
    expect(plan.slots.some((s) => s.kind === "free")).toBe(false);
  });
});
