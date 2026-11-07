import { describe, expect, test } from "bun:test";
import {
  aiLabel,
  capChange,
  capChangeStartsNewAttempt,
  privateLabel,
  honestyDue,
  honestyXp,
  milestonePayouts,
  inRoughPatch,
  milestonesToPay,
  nextMilestone,
  quitProgress,
  quitTimeline,
  QuitRuleError,
  validateLog,
  validateSetup,
  type QuitLog,
  type QuitPeriod,
} from "./quits";

const TZ = "Africa/Lagos"; // UTC+1, no DST
const at = (local: string) => new Date(`${local}+01:00`);
const open = (start: string, limitPerDay: number | null = null): QuitPeriod => ({
  startedAt: at(start),
  endedAt: null,
  limitPerDay,
});
const closed = (start: string, end: string, limitPerDay: number | null = null): QuitPeriod => ({
  startedAt: at(start),
  endedAt: at(end),
  limitPerDay,
});
const relapse = (local: string): QuitLog => ({ at: at(local), amount: null });
const use = (local: string, amount: number): QuitLog => ({ at: at(local), amount });

describe("quit completely: streaks", () => {
  test("counts whole 24-hour days since the start when there's no relapse", () => {
    const p = quitProgress("quit", [open("2026-11-01T22:00:00")], [], at("2026-11-07T21:00:00"), TZ);
    expect(p.currentDays).toBe(5); // 5 days 23 hours
    expect(p.runStartedAt).toEqual(at("2026-11-01T22:00:00"));
  });

  test("a relapse sends the current streak back to day 0", () => {
    const p = quitProgress(
      "quit",
      [open("2026-10-01T08:00:00")],
      [relapse("2026-11-07T01:00:00")],
      at("2026-11-07T09:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(0);
    expect(p.runStartedAt).toEqual(at("2026-11-07T01:00:00"));
  });

  test("a relapse keeps the longest streak and the total clean days", () => {
    const p = quitProgress(
      "quit",
      [open("2026-10-01T08:00:00")],
      [relapse("2026-11-07T01:00:00")],
      at("2026-11-07T09:00:00"),
      TZ,
    );
    expect(p.longestDays).toBe(36); // Oct 1 08:00 → Nov 7 01:00
    expect(p.totalCleanDays).toBe(37); // Oct 1 … Nov 6, all finished and relapse-free
  });

  test("the longest streak is the best run, not the latest", () => {
    const p = quitProgress(
      "quit",
      [open("2026-10-01T00:00:00")],
      [relapse("2026-10-21T00:00:00"), relapse("2026-10-25T00:00:00")],
      at("2026-10-30T00:00:00"),
      TZ,
    );
    expect(p.longestDays).toBe(20);
    expect(p.currentDays).toBe(5);
  });

  test("a day with a relapse is not a clean day, and today isn't counted until it ends", () => {
    const p = quitProgress(
      "quit",
      [open("2026-11-01T09:00:00")],
      [relapse("2026-11-03T23:00:00")],
      at("2026-11-05T12:00:00"),
      TZ,
    );
    // Nov 1, 2, 4 are clean; Nov 3 had the relapse; Nov 5 is today.
    expect(p.totalCleanDays).toBe(3);
  });

  test("two relapses in one night reset once and leave no extra gap", () => {
    const p = quitProgress(
      "quit",
      [open("2026-11-01T00:00:00")],
      [relapse("2026-11-04T23:00:00"), relapse("2026-11-05T00:30:00")],
      at("2026-11-06T00:30:00"),
      TZ,
    );
    expect(p.currentDays).toBe(1);
    expect(p.longestDays).toBe(3);
  });

  test("a backdated relapse counts from when it happened, not when it was logged", () => {
    // Logged at 02:00 on Nov 8 about 01:00 on Nov 7: the run is 25 hours old, not 0.
    const p = quitProgress("quit", [open("2026-11-01T00:00:00")], [relapse("2026-11-07T01:00:00")], at("2026-11-08T02:00:00"), TZ);
    expect(p.currentDays).toBe(1);
  });

  test("logs in the future are ignored", () => {
    const p = quitProgress("quit", [open("2026-11-01T00:00:00")], [relapse("2026-11-09T00:00:00")], at("2026-11-08T00:00:00"), TZ);
    expect(p.currentDays).toBe(7);
  });

  test("a relapse outside any tracked period doesn't affect streaks", () => {
    const p = quitProgress(
      "quit",
      [closed("2026-10-01T00:00:00", "2026-10-10T00:00:00"), open("2026-10-20T00:00:00")],
      [relapse("2026-10-15T00:00:00")],
      at("2026-10-27T00:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(7);
    expect(p.longestDays).toBe(9);
  });

  test("with no open period there's no current streak, but the history stays", () => {
    const p = quitProgress("quit", [closed("2026-10-01T00:00:00", "2026-10-11T12:00:00")], [], at("2026-11-07T00:00:00"), TZ);
    expect(p.currentDays).toBe(0);
    expect(p.runStartedAt).toBeNull();
    expect(p.longestDays).toBe(10);
    expect(p.totalCleanDays).toBe(10); // Oct 1–10; Oct 11 was cut short by ending
  });

  test("totals add up across periods; the gap between them isn't counted", () => {
    const p = quitProgress(
      "quit",
      [closed("2026-10-01T00:00:00", "2026-10-04T12:00:00"), open("2026-10-10T00:00:00")],
      [],
      at("2026-10-13T12:00:00"),
      TZ,
    );
    expect(p.totalCleanDays).toBe(3 + 3); // Oct 1–3, then Oct 10–12
    expect(p.currentDays).toBe(3);
  });

  test("a streak can't be paused: resuming starts again from day 0, keeping longest and total", () => {
    // 10 clean days, paused for 5, resumed 2 days ago.
    const p = quitProgress(
      "quit",
      [closed("2026-10-01T00:00:00", "2026-10-11T00:00:00"), open("2026-10-16T00:00:00")],
      [],
      at("2026-10-18T00:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(2);
    expect(p.runStartedAt).toEqual(at("2026-10-16T00:00:00"));
    expect(p.longestDays).toBe(10);
    expect(p.totalCleanDays).toBe(10 + 2);
  });

  test("periods given out of order are handled", () => {
    const periods = [open("2026-10-10T00:00:00"), closed("2026-10-01T00:00:00", "2026-10-04T12:00:00")];
    expect(quitProgress("quit", periods, [], at("2026-10-13T12:00:00"), TZ).currentDays).toBe(3);
  });

  test("a quit has no today usage", () => {
    expect(quitProgress("quit", [open("2026-11-01T00:00:00")], [], at("2026-11-02T00:00:00"), TZ).today).toBeNull();
  });

  test("local days follow the user's time zone", () => {
    // 23:30 UTC on Nov 3 is already Nov 4 in Lagos.
    const p = quitProgress(
      "quit",
      [open("2026-11-01T09:00:00")],
      [{ at: new Date("2026-11-03T23:30:00Z"), amount: null }],
      at("2026-11-06T12:00:00"),
      TZ,
    );
    // Clean: Nov 1, 2, 3, 5. Nov 4 (Lagos) had the relapse.
    expect(p.totalCleanDays).toBe(4);
  });
});

describe("cut down: streaks", () => {
  test("a day within the cap is clean; exactly the cap is still clean", () => {
    const p = quitProgress(
      "limit",
      [open("2026-11-01T08:00:00", 60)],
      [use("2026-11-01T20:00:00", 40), use("2026-11-02T20:00:00", 60)],
      at("2026-11-03T12:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(2);
    expect(p.totalCleanDays).toBe(2);
  });

  test("going over the cap sends the streak back to 0", () => {
    const p = quitProgress(
      "limit",
      [open("2026-11-01T08:00:00", 60)],
      [use("2026-11-03T20:00:00", 61)],
      at("2026-11-04T12:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(0);
    expect(p.longestDays).toBe(2);
    expect(p.totalCleanDays).toBe(2);
  });

  test("the run after an over day starts at the next local midnight", () => {
    const p = quitProgress("limit", [open("2026-11-01T08:00:00", 60)], [use("2026-11-03T20:00:00", 90)], at("2026-11-06T12:00:00"), TZ);
    expect(p.runStartedAt).toEqual(at("2026-11-04T00:00:00"));
    expect(p.currentDays).toBe(2); // Nov 4, 5
  });

  test("usage adds up across the day before it's compared with the cap", () => {
    const p = quitProgress(
      "limit",
      [open("2026-11-01T00:00:00", 2)],
      [use("2026-11-02T09:00:00", 1), use("2026-11-02T13:00:00", 1), use("2026-11-02T22:00:00", 1)],
      at("2026-11-03T12:00:00"),
      TZ,
    );
    expect(p.currentDays).toBe(0);
  });

  test("today counts as clean until it goes over, but isn't added until it ends", () => {
    const under = quitProgress("limit", [open("2026-11-01T00:00:00", 60)], [use("2026-11-03T10:00:00", 30)], at("2026-11-03T12:00:00"), TZ);
    expect(under.currentDays).toBe(2);
    expect(under.today).toEqual({ used: 30, cap: 60, over: false });

    const over = quitProgress("limit", [open("2026-11-01T00:00:00", 60)], [use("2026-11-03T10:00:00", 80)], at("2026-11-03T12:00:00"), TZ);
    expect(over.currentDays).toBe(0);
    expect(over.today).toEqual({ used: 80, cap: 60, over: true });
  });

  test("a day with no usage logged counts as clean", () => {
    const p = quitProgress("limit", [open("2026-11-01T00:00:00", 60)], [], at("2026-11-08T12:00:00"), TZ);
    expect(p.currentDays).toBe(7);
    expect(p.today).toEqual({ used: 0, cap: 60, over: false });
  });

  test("after raising the cap, the morning's usage still counts towards the new cap that day", () => {
    // Used 50 of 30 in the morning, raised to 60 at noon: the new attempt's day is within 60.
    const periods = [closed("2026-11-01T00:00:00", "2026-11-05T12:00:00", 30), open("2026-11-05T12:00:00", 60)];
    const logs = [use("2026-11-05T09:00:00", 50), use("2026-11-05T15:00:00", 20)];
    const p = quitProgress("limit", periods, logs, at("2026-11-06T12:00:00"), TZ);
    expect(p.currentDays).toBe(0); // 70 > 60: the raise didn't hide the afternoon
    expect(p.longestDays).toBe(4); // Nov 1–4 under the old cap
  });

  test("raising the cap starts a fresh run under the new cap", () => {
    const periods = [closed("2026-11-01T00:00:00", "2026-11-05T12:00:00", 30), open("2026-11-05T12:00:00", 60)];
    const p = quitProgress("limit", periods, [use("2026-11-03T09:00:00", 50)], at("2026-11-08T12:00:00"), TZ);
    expect(p.runStartedAt).toEqual(at("2026-11-05T12:00:00"));
    expect(p.currentDays).toBe(3); // Nov 5, 6, 7
    expect(p.longestDays).toBe(3);
    expect(p.totalCleanDays).toBe(2 + 1 + 3); // Nov 1, 2 · Nov 4 · Nov 5–7
  });
});

describe("cut down: lowering the cap", () => {
  const lowered = (continuesRun = true): QuitPeriod[] => [
    closed("2026-11-01T00:00:00", "2026-11-05T12:00:00", 60),
    { ...open("2026-11-05T12:00:00", 30), continuesRun },
  ];

  test("lowering the cap keeps the streak going", () => {
    const logs = [use("2026-11-02T20:00:00", 50), use("2026-11-04T20:00:00", 50)];
    const p = quitProgress("limit", lowered(), logs, at("2026-11-08T12:00:00"), TZ);
    expect(p.currentDays).toBe(7); // Nov 1–7, one run across both caps
    expect(p.runStartedAt).toEqual(at("2026-11-01T00:00:00"));
    expect(p.totalCleanDays).toBe(7);
  });

  test("past days keep the cap they ran under: 50 of 60 isn't re-judged against 30", () => {
    const p = quitProgress("limit", lowered(), [use("2026-11-02T20:00:00", 50)], at("2026-11-08T12:00:00"), TZ);
    expect(p.longestDays).toBe(7);
  });

  test("the lower cap applies from the day it's set", () => {
    // Lowered at noon on Nov 5 with 40 already used: over the new 30.
    const p = quitProgress("limit", lowered(), [use("2026-11-05T09:00:00", 40)], at("2026-11-08T12:00:00"), TZ);
    expect(p.currentDays).toBe(2); // Nov 6, 7
    expect(p.longestDays).toBe(4); // Nov 1–4
  });

  test("the day the cap changed is counted once", () => {
    const p = quitProgress("limit", lowered(), [], at("2026-11-06T12:00:00"), TZ);
    expect(p.totalCleanDays).toBe(5); // Nov 1–5
  });

  test("capChange: raised starts a new attempt, lowered carries on, same is nothing", () => {
    expect(capChange(30, 60)).toBe("raised");
    expect(capChange(60, 30)).toBe("lowered");
    expect(capChange(60, 60)).toBe("unchanged");
  });
});

describe("labels (privacy)", () => {
  test("Paddie sees the alias by default", () => {
    expect(aiLabel({ title: "Porn", alias: "Project P", showNameToAi: false })).toBe("Project P");
  });
  test("with no alias, a neutral phrase, never the name", () => {
    expect(aiLabel({ title: "Porn", alias: null, showNameToAi: false })).toBe("a habit you're quitting");
  });
  test("the real name only when it's been turned on", () => {
    expect(aiLabel({ title: "Porn", alias: "Project P", showNameToAi: true })).toBe("Porn");
  });
  test("the private label never uses the name, whatever the setting", () => {
    expect(privateLabel({ alias: "Project P" })).toBe("Project P");
    expect(privateLabel({ alias: null })).toBe("a habit you're quitting");
  });
});

describe("milestones", () => {
  test("pays every milestone crossed that this run hasn't been paid for", () => {
    expect(milestonesToPay(7, [])).toEqual([
      { days: 1, xp: 5 },
      { days: 3, xp: 10 },
      { days: 7, xp: 20 },
    ]);
    expect(milestonesToPay(7, [1, 3])).toEqual([{ days: 7, xp: 20 }]);
  });

  test("nothing is due before day 1", () => {
    expect(milestonesToPay(0, [])).toEqual([]);
  });

  test("a new run after a relapse earns the same milestones again (paid per run)", () => {
    // The previous run's payouts are keyed to that run, so the new run starts with none paid.
    expect(milestonesToPay(3, [])).toEqual([
      { days: 1, xp: 5 },
      { days: 3, xp: 10 },
    ]);
  });

  test("the next milestone and the days left to it", () => {
    expect(nextMilestone(0)).toEqual({ days: 1, daysLeft: 1 });
    expect(nextMilestone(12)).toEqual({ days: 14, daysLeft: 2 });
    expect(nextMilestone(14)).toEqual({ days: 30, daysLeft: 16 });
  });

  test("there's no next milestone after a year", () => {
    expect(nextMilestone(365)).toBeNull();
    expect(milestonesToPay(400, []).at(-1)).toEqual({ days: 365, xp: 150 });
  });
});

describe("XP split (Character 60 / Mental 40)", () => {
  test("the honesty bonus splits 1 and 1", () => {
    const xp = honestyXp();
    expect(xp).toHaveLength(2);
    expect(xp).toContainEqual({ pillar: "character", amount: 1 });
    expect(xp).toContainEqual({ pillar: "mental", amount: 1 });
  });
  test("each milestone's XP adds back up to its amount", () => {
    for (const m of milestonePayouts(365, [])) {
      const total = m.xp.reduce((s, e) => s + e.amount, 0);
      expect(total).toBe([5, 10, 20, 30, 50, 60, 80, 100, 150][[1, 3, 7, 14, 30, 60, 90, 180, 365].indexOf(m.days)]);
    }
  });
  test("a 7-day milestone pays 12 Character and 8 Mental", () => {
    expect(milestonePayouts(7, [1, 3])).toEqual([{ days: 7, xp: [{ pillar: "character", amount: 12 }, { pillar: "mental", amount: 8 }] }]);
  });
});

describe("honesty XP", () => {
  test("logging a slip earns the bonus the first time that day", () => {
    expect(honestyDue(at("2026-11-07T09:00:00"), new Set(), TZ)).toBe(true);
  });

  test("only once a local day per quit", () => {
    expect(honestyDue(at("2026-11-07T23:00:00"), new Set(["2026-11-07"]), TZ)).toBe(false);
    expect(honestyDue(at("2026-11-08T00:10:00"), new Set(["2026-11-07"]), TZ)).toBe(true);
  });

  test("keyed to the day it's logged, so backdated slips can't each earn it", () => {
    // Already rewarded today for one backdated slip; logging another about last week earns nothing.
    expect(honestyDue(at("2026-11-07T10:00:00"), new Set(["2026-11-07"]), TZ)).toBe(false);
  });
});

describe("rough patch (mode)", () => {
  const now = at("2026-11-07T12:00:00");

  test("2 relapses in the last 3 days is a rough patch", () => {
    const logs = [relapse("2026-11-05T23:00:00"), relapse("2026-11-07T01:00:00")];
    expect(inRoughPatch("quit", [open("2026-10-01T00:00:00")], logs, now, TZ)).toBe(true);
  });

  test("one relapse isn't", () => {
    expect(inRoughPatch("quit", [open("2026-10-01T00:00:00")], [relapse("2026-11-07T01:00:00")], now, TZ)).toBe(false);
  });

  test("relapses older than 3 local days don't count", () => {
    const logs = [relapse("2026-11-04T23:00:00"), relapse("2026-11-07T01:00:00")];
    expect(inRoughPatch("quit", [open("2026-10-01T00:00:00")], logs, now, TZ)).toBe(false);
  });

  test("for cut down, it's 2 over days, not 2 logs", () => {
    const period = [open("2026-10-01T00:00:00", 60)];
    const twoLogsOneDay = [use("2026-11-06T09:00:00", 40), use("2026-11-06T20:00:00", 40)];
    expect(inRoughPatch("limit", period, twoLogsOneDay, now, TZ)).toBe(false);
    const twoOverDays = [use("2026-11-05T20:00:00", 70), use("2026-11-06T20:00:00", 90)];
    expect(inRoughPatch("limit", period, twoOverDays, now, TZ)).toBe(true);
  });

  test("usage within the cap is never a rough patch", () => {
    const logs = [use("2026-11-05T20:00:00", 60), use("2026-11-06T20:00:00", 60), use("2026-11-07T09:00:00", 60)];
    expect(inRoughPatch("limit", [open("2026-10-01T00:00:00", 60)], logs, now, TZ)).toBe(false);
  });
});

describe("validation", () => {
  test("quitting completely has no cap or unit", () => {
    expect(() => validateSetup("quit", null, null)).not.toThrow();
    expect(() => validateSetup("quit", 10, "minutes")).toThrow(QuitRuleError);
  });

  test("cutting down needs a unit and a whole cap of at least 1", () => {
    expect(() => validateSetup("limit", 60, "minutes")).not.toThrow();
    expect(() => validateSetup("limit", 60, null)).toThrow(QuitRuleError);
    expect(() => validateSetup("limit", 0, "times")).toThrow(/quitting completely/);
    expect(() => validateSetup("limit", 1.5, "times")).toThrow(QuitRuleError);
    expect(() => validateSetup("limit", null, "times")).toThrow(QuitRuleError);
  });

  const now = at("2026-11-07T12:00:00");
  const periods = [open("2026-11-01T00:00:00")];

  test("a relapse can be backdated within the tracked time", () => {
    expect(validateLog("quit", { at: at("2026-11-07T01:00:00"), amount: null }, periods, now)).toBeNull();
  });

  test("a log can't be in the future", () => {
    expect(() => validateLog("quit", { at: at("2026-11-07T13:00:00"), amount: null }, periods, now)).toThrow(/future/);
  });

  test("a log can't be from before tracking started", () => {
    expect(() => validateLog("quit", { at: at("2026-10-30T13:00:00"), amount: null }, periods, now)).toThrow(/outside/);
  });

  test("a relapse has no amount; usage needs a whole amount of at least 1", () => {
    expect(() => validateLog("quit", { at: now, amount: 3 }, periods, now)).toThrow(QuitRuleError);
    const limit = [open("2026-11-01T00:00:00", 60)];
    expect(() => validateLog("limit", { at: now, amount: null }, limit, now)).toThrow(QuitRuleError);
    expect(() => validateLog("limit", { at: now, amount: 0 }, limit, now)).toThrow(QuitRuleError);
    expect(() => validateLog("limit", { at: now, amount: 25 }, limit, now)).not.toThrow();
  });

  test("notes are trimmed, blank becomes none, and at most 500 characters", () => {
    expect(validateLog("quit", { at: now, amount: null, note: "  bored after midnight  " }, periods, now)).toBe(
      "bored after midnight",
    );
    expect(validateLog("quit", { at: now, amount: null, note: "   " }, periods, now)).toBeNull();
    expect(() => validateLog("quit", { at: now, amount: null, note: "x".repeat(501) }, periods, now)).toThrow(/too long/);
  });

  test("raising the cap starts a new attempt; lowering or keeping it doesn't", () => {
    expect(capChangeStartsNewAttempt(30, 60)).toBe(true);
    expect(capChangeStartsNewAttempt(60, 30)).toBe(false);
    expect(capChangeStartsNewAttempt(60, 60)).toBe(false);
  });
});

describe("history", () => {
  test("shows starts, stops, restarts and slips, newest first", () => {
    const periods = [closed("2026-11-01T08:00:00", "2026-11-03T08:00:00"), open("2026-11-05T08:00:00")];
    const t = quitTimeline("quit", periods, [relapse("2026-11-02T23:00:00"), relapse("2026-11-06T01:00:00")], TZ);
    expect(t.map((e) => e.type)).toEqual(["slip", "started", "stopped", "slip", "started"]);
    expect(t[1]).toMatchObject({ type: "started", again: true });
    expect(t[4]).toMatchObject({ type: "started", again: false });
  });

  test("a cap change reads as a cap change, not a stop and restart", () => {
    const lowered: QuitPeriod = { startedAt: at("2026-11-03T12:00:00"), endedAt: at("2026-11-04T12:00:00"), limitPerDay: 30, continuesRun: true };
    const raised: QuitPeriod = { startedAt: at("2026-11-04T12:00:00"), endedAt: null, limitPerDay: 45 };
    const t = quitTimeline("limit", [closed("2026-11-01T08:00:00", "2026-11-03T12:00:00", 60), lowered, raised], [], TZ);
    expect(t).toEqual([
      { type: "cap", at: at("2026-11-04T12:00:00"), cap: 45, change: "raised" },
      { type: "cap", at: at("2026-11-03T12:00:00"), cap: 30, change: "lowered" },
      { type: "started", at: at("2026-11-01T08:00:00"), again: false, cap: 60 },
    ]);
  });

  test("marks the log that takes a cut-down day over its cap, and only that one", () => {
    const logs = [use("2026-11-02T09:00:00", 40), use("2026-11-02T13:00:00", 30), use("2026-11-02T20:00:00", 10), use("2026-11-03T09:00:00", 60)];
    const t = quitTimeline("limit", [open("2026-11-01T08:00:00", 60)], logs, TZ).filter((e) => e.type === "used");
    expect(t.map((e) => [e.dayTotal, e.tippedOver])).toEqual([[60, false], [80, false], [70, true], [40, false]]);
  });

  test("a paused quit ends on its stop", () => {
    const t = quitTimeline("quit", [closed("2026-11-01T08:00:00", "2026-11-03T08:00:00")], [], TZ);
    expect(t.map((e) => e.type)).toEqual(["stopped", "started"]);
  });

  test("passes the caller's log rows through", () => {
    const log = { at: at("2026-11-02T23:00:00"), amount: null, note: "bored" };
    const [e] = quitTimeline("quit", [open("2026-11-01T08:00:00")], [log], TZ);
    expect(e).toMatchObject({ type: "slip", log: { note: "bored" } });
  });
});
