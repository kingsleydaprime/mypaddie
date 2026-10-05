import { describe, expect, test } from "bun:test";
import { copyFor } from "./copy";

describe("copyFor", () => {
  test("escalation gets firmer level by level, and the last one mentions late XP", () => {
    const bodies = [1, 2, 3, 4].map((level) => copyFor({ kind: "nudge", level, title: "Morning reading", items: null }).body);
    expect(new Set(bodies).size).toBe(4);
    expect(bodies[0]).toContain("Morning reading");
    expect(bodies[3]).toContain("Late still earns XP");
  });

  test("levels outside 1–4 clamp instead of crashing", () => {
    expect(copyFor({ kind: "nudge", level: 9, title: "X", items: null }).body).toContain("Last nudge");
    expect(copyFor({ kind: "nudge", level: 0, title: "X", items: null }).body).toContain("Two minutes");
  });

  test("the same task's nudges replace each other (same tag)", () => {
    const a = copyFor({ kind: "nudge", level: 1, title: "Gym", items: null });
    const b = copyFor({ kind: "nudge", level: 2, title: "Gym", items: null });
    expect(a.tag).toBe(b.tag);
  });

  test("a check-in asks, it doesn't nag", () => {
    expect(copyFor({ kind: "checkin", level: 1, title: "Email the lecturer", items: null })).toMatchObject({
      title: "Email the lecturer",
      body: "Time's passed. Did you do it?",
    });
  });

  test("the brief lists the three things", () => {
    expect(copyFor({ kind: "brief", level: 1, title: null, items: ["Reading", "Gym", "Email"] }).body).toBe("Reading · Gym · Email. Pick one.");
  });

  test("an empty brief is still friendly", () => {
    expect(copyFor({ kind: "brief", level: 1, title: null, items: [] }).body).toContain("Nothing scheduled");
  });

  test("the reminder ladder: evening, morning, 30, 10", () => {
    const r = (level: number) => copyFor({ kind: "reminder", level, title: "Standup", items: null, due: "14:00" });
    expect(r(1)).toMatchObject({ title: "Tomorrow at 14:00", body: "Standup. Sort what you need tonight." });
    expect(r(2)).toMatchObject({ title: "Today at 14:00" });
    expect(r(3)).toMatchObject({ title: "In 30 minutes", body: "Standup at 14:00. Start wrapping up." });
    expect(r(4)).toMatchObject({ title: "In 10 minutes", body: "Standup. Go." });
  });

  test("events: a birthday morning says call them; a meeting says plan around it", () => {
    expect(copyFor({ kind: "event", level: 3, title: "Tolu's birthday", items: null, eventKind: "birthday", person: "Tolu" })).toMatchObject({
      title: "It's Tolu's birthday",
      body: "Call or text. A voice note counts.",
    });
    expect(copyFor({ kind: "event", level: 3, title: "Interview", items: null, eventKind: "meeting", due: "14:00" })).toMatchObject({
      title: "Today at 14:00",
    });
    expect(copyFor({ kind: "event", level: 1, title: "Wedding", items: null, eventKind: "wedding", days: 5 }).title).toBe("In 5 days");
  });

  test("a custom note becomes the body; the title still says when", () => {
    expect(copyFor({ kind: "reminder", level: 3, title: "Bank visit", items: null, due: "11:00", note: "Bring the signed form" })).toMatchObject({
      title: "In 30 minutes",
      body: "Bring the signed form",
    });
  });

  test("on an escalation the note goes under Paddie's line", () => {
    const body = copyFor({ kind: "nudge", level: 2, title: "Call Mum", items: null, note: "before she sleeps" }).body;
    expect(body).toBe("Still waiting on Call Mum. The day is not getting longer.\nbefore she sleeps");
  });

  test("a blank note is ignored", () => {
    expect(copyFor({ kind: "checkin", level: 1, title: "X", items: null, note: "  " }).body).toBe("Time's passed. Did you do it?");
  });
});
