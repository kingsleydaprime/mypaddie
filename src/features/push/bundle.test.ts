import { describe, expect, test } from "bun:test";
import { planNotifications, type OutgoingNudge } from "./bundle";

const phone = { endpoint: "https://push.example/phone", p256dh: "k", auth: "a" };
const laptop = { endpoint: "https://push.example/laptop", p256dh: "k2", auth: "a2" };
const nudge = (title: string, level = 1, device = phone): OutgoingNudge => ({ ...device, kind: "nudge", level, title, items: null });
const checkin = (title: string, device = phone): OutgoingNudge => ({ ...device, kind: "checkin", level: 1, title, items: null });
const headsup = (title: string, due: string, device = phone): OutgoingNudge => ({ ...device, kind: "headsup", level: 0, title, items: null, due });
const reminder = (title: string, level: number, due: string, device = phone): OutgoingNudge => ({ ...device, kind: "reminder", level, title, items: null, due });
const brief = (items: string[], device = phone): OutgoingNudge => ({ ...device, kind: "brief", level: 1, title: null, items });

describe("planNotifications", () => {
  test("two overdue items stay separate", () => {
    expect(planNotifications([nudge("Reading"), checkin("Email")])).toHaveLength(2);
  });

  test("three or more overdue items become one notification", () => {
    const out = planNotifications([nudge("Reading"), nudge("Duolingo"), checkin("Email"), nudge("Brush")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.copy).toEqual({
      title: "4 things need you",
      body: "Reading, Duolingo, Email +1. Pick one.",
      url: "/app",
      tag: "bundle-overdue",
    });
  });

  test("a bundle with a third-level nudge in it is firmer", () => {
    const out = planNotifications([nudge("Reading", 3), nudge("Duolingo"), nudge("Brush")]);
    expect(out[0]!.copy.title).toBe("Paddie, again: 3 things need you");
  });

  test("the morning brief is never bundled", () => {
    const out = planNotifications([brief(["A", "B", "C"]), nudge("Reading"), nudge("Duolingo"), nudge("Brush")]);
    expect(out.map((n) => n.copy.tag)).toEqual(["brief", "bundle-overdue"]);
  });

  test("heads-ups bundle separately from overdue items", () => {
    const out = planNotifications([headsup("Gym", "18:00"), headsup("Call mum", "18:05"), headsup("Read", "18:10"), nudge("Reading")]);
    expect(out.map((n) => n.copy.tag)).toEqual(["task-Reading", "bundle-upcoming"]);
    expect(out[1]!.copy.body).toBe("Gym 18:00 · Call mum 18:05 · Read 18:10");
  });

  test("a single heads-up says when", () => {
    expect(planNotifications([headsup("Gym", "18:00")])[0]!.copy).toMatchObject({ title: "Coming up at 18:00", body: "Gym. Get ready." });
  });

  test("bundling is per device: each device gets its own", () => {
    const three = (d: typeof phone) => [nudge("A", 1, d), nudge("B", 1, d), nudge("C", 1, d)];
    const out = planNotifications([...three(phone), ...three(laptop)]);
    expect(out).toHaveLength(2);
    expect(out.map((n) => n.subscription.endpoint).sort()).toEqual([laptop.endpoint, phone.endpoint]);
  });

  test("nothing in, nothing out", () => {
    expect(planNotifications([])).toEqual([]);
  });

  test("evening-before reminders bundle as 'Tomorrow'", () => {
    const out = planNotifications([reminder("Standup", 1, "09:00"), reminder("Call boss", 1, "14:00"), reminder("Gym", 1, "18:00")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.copy).toMatchObject({ title: "Tomorrow", body: "Standup 09:00 · Call boss 14:00 · Gym 18:00" });
  });

  test("mixed reminders bundle as 'Coming up'", () => {
    const out = planNotifications([reminder("A", 3, "10:30"), reminder("B", 4, "10:10"), headsup("C", "10:15")]);
    expect(out[0]!.copy.title).toBe("Coming up");
  });
});
