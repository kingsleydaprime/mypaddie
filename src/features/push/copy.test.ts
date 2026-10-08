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

  test("important events: 10 minutes before, and when they start", () => {
    expect(copyFor({ kind: "event", level: 5, title: "Board meeting", items: null, eventKind: "meeting", due: "19:00" })).toMatchObject({
      title: "In 10 minutes",
      body: "Board meeting at 19:00. Get in position.",
    });
    expect(copyFor({ kind: "event", level: 6, title: "Board meeting", items: null, eventKind: "meeting", due: "19:00" })).toMatchObject({
      title: "Starting now",
      body: "Board meeting has started. Are you in?",
    });
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

  test("application reminders say what's missing and when it really closes", () => {
    expect(copyFor({ kind: "application", level: 3, title: "Scholarship X", items: ["Essay", "2nd reference"], days: 3, due: "Mon 16 Nov 05:59" })).toMatchObject({
      title: "Scholarship X: 3 days to your target",
      body: "Still missing: Essay, 2nd reference. Closes Mon 16 Nov 05:59 your time.",
      url: "/app/applications",
    });
    expect(copyFor({ kind: "application", level: 5, title: "Job Y", items: [], due: null }).body).toBe("Everything's ready — submit early.");
  });
});

describe("fun nudge", () => {
  test("says how long it's been and prescribes from his list", () => {
    const c = copyFor({ kind: "fun", level: 1, title: null, items: ["Movie night", "Beach"], days: 9 });
    expect(c.title).toBe("9 days without fun");
    expect(c.body).toContain("Movie night, Beach");
    expect(c.url).toBe("/app/fun");
  });
  test("no ideas listed: still an invitation, not a crash", () => {
    expect(copyFor({ kind: "fun", level: 1, title: null, items: null }).body).toContain("Rest is part of the game");
  });
});

describe("review nudge", () => {
  test("Sunday: the week; month end: the month by name; year end: the year", () => {
    expect(copyFor({ kind: "review", level: 1, title: "October 2026", items: null }).title).toBe("Weekly review");
    expect(copyFor({ kind: "review", level: 2, title: "October 2026", items: null }).title).toBe("October in review");
    expect(copyFor({ kind: "review", level: 4, title: "December 2026", items: null }).title).toBe("The year in review");
    expect(copyFor({ kind: "review", level: 1, title: null, items: null }).url).toBe("/app/growth");
  });
});

describe("close-out nudge", () => {
  test("says how many are open and opens the close-out", () => {
    const c = copyFor({ kind: "close_out", level: 2, title: null, items: null });
    expect(c.title).toBe("Close out the day");
    expect(c.body).toStartWith("2 things still open");
    expect(c.url).toBe("/app/close");
  });
  test("one open, and none open", () => {
    expect(copyFor({ kind: "close_out", level: 1, title: null, items: null }).body).toStartWith("1 thing still open");
    expect(copyFor({ kind: "close_out", level: 0, title: null, items: null }).body).toContain("one win");
  });
});

describe("leave nudge", () => {
  test("names what's next and when", () => {
    const c = copyFor({ kind: "leave", level: 1, title: "Standup", items: null, due: "18:20" });
    expect(c.title).toBe("Time to head out — Standup at 18:20");
    expect(c.body).toContain("Standup starts soon");
  });
});

describe("close-out summary", () => {
  const n = (level: number, summary: { done: number; slipped: number; xp: number; tomorrow: number }, items: string[]) =>
    copyFor({ kind: "close_out", level, title: null, items, summary });
  test("the day in numbers, what to do, and tomorrow", () => {
    const c = n(2, { done: 4, slipped: 1, xp: 35, tomorrow: 5 }, ["09:00 Standup", "06:00 Pray", "Read"]);
    expect(c.title).toBe("Today: 4 done, 1 slipped, 2 open · +35 XP");
    expect(c.body).toBe("Move, drop or own the open ones. Tomorrow: 09:00 Standup, 06:00 Pray, Read +2 more.");
    expect(c.url).toBe("/app/close");
  });
  test("everything done, tomorrow clear", () => {
    const c = n(0, { done: 3, slipped: 0, xp: 20, tomorrow: 0 }, []);
    expect(c.title).toBe("Today: 3 done · +20 XP");
    expect(c.body).toBe("Name one win. Tomorrow's clear so far.");
  });
  test("one open, a day that lost XP", () => {
    const c = n(1, { done: 0, slipped: 0, xp: -5, tomorrow: 1 }, ["Gym"]);
    expect(c.title).toBe("Today: 0 done, 1 open · -5 XP");
    expect(c.body).toBe("Move, drop or own the open one. Tomorrow: Gym.");
  });
});
