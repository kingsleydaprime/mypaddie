import { describe, expect, test } from "bun:test";
import { applyScheduleChange, dayEndsAt, DEFAULT_SCHEDULE, isQuiet, readSchedule } from "./schedule";

describe("isQuiet", () => {
  test("a window that crosses midnight", () => {
    const s = { quietStart: "22:00", quietEnd: "07:00" };
    expect(["22:00", "23:59", "00:00", "06:59"].map((t) => isQuiet(t, s))).toEqual([true, true, true, true]);
    expect(["07:00", "12:00", "21:59"].map((t) => isQuiet(t, s))).toEqual([false, false, false]);
  });
  test("a window within one day (a nap)", () => {
    const s = { quietStart: "13:00", quietEnd: "15:00" };
    expect(isQuiet("14:00", s)).toBe(true);
    expect(isQuiet("15:00", s)).toBe(false);
  });
});

describe("dayEndsAt", () => {
  test("quiet from the evening: the day ends then", () => {
    expect(dayEndsAt({ quietStart: "22:30" })).toBe("22:30");
  });
  test("quiet from after midnight: the day runs to its end", () => {
    expect(dayEndsAt({ quietStart: "00:30" })).toBe("23:59");
  });
});

describe("readSchedule", () => {
  test("nothing saved → defaults", () => {
    expect(readSchedule(null)).toEqual(DEFAULT_SCHEDULE);
  });
  test("saved fields win; invalid ones fall back", () => {
    expect(readSchedule({ quietStart: "23:00", briefAt: "nonsense", eventCloseDays: 10 })).toMatchObject({
      quietStart: "23:00",
      briefAt: "08:00",
      eventCloseDays: 10,
    });
  });
});

describe("applyScheduleChange", () => {
  test("a valid change", () => {
    const r = applyScheduleChange(DEFAULT_SCHEDULE, { quietStart: "23:00", quietEnd: "06:30", briefAt: "06:45" });
    expect(r).toMatchObject({ ok: true, schedule: { quietStart: "23:00", quietEnd: "06:30", briefAt: "06:45" } });
  });
  test("a reminder inside quiet hours is refused, with the reason", () => {
    const r = applyScheduleChange(DEFAULT_SCHEDULE, { briefAt: "06:00" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("never arrive");
  });
  test("moving quiet hours over an existing reminder is refused too", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { quietStart: "19:30" }).ok).toBe(false); // evening reminder is 20:00
  });
  test("empty quiet hours are refused", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { quietStart: "07:00" }).ok).toBe(false);
  });
  test("bad formats are refused", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { briefAt: "8am" }).ok).toBe(false);
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { eventCloseDays: 0 }).ok).toBe(false);
  });
});

describe("fun nudge settings", () => {
  test("defaults: after 7 days without fun, at 17:00", () => {
    expect(readSchedule(null)).toMatchObject({ funEveryDays: 7, funAt: "17:00" });
  });
  test("0 turns it off; negative or huge is refused", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { funEveryDays: 0 }).ok).toBe(true);
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { funEveryDays: -1 }).ok).toBe(false);
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { funEveryDays: 61 }).ok).toBe(false);
  });
  test("a fun nudge inside quiet hours is refused: it would never arrive", () => {
    const r = applyScheduleChange(DEFAULT_SCHEDULE, { funAt: "23:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("fun nudge");
  });
  test("an older saved schedule without the fun fields gets the defaults", () => {
    expect(readSchedule({ quietStart: "23:00" })).toMatchObject({ quietStart: "23:00", funEveryDays: 7, funAt: "17:00" });
  });
});

describe("close-out settings", () => {
  test("on at 21:30 by default", () => {
    expect(readSchedule(null)).toMatchObject({ closeOut: true, closeAt: "21:30" });
  });
  test("a close-out time inside quiet hours is refused while it's on", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { closeAt: "22:30" }).ok).toBe(false);
  });
  test("but not when it's switched off", () => {
    expect(applyScheduleChange(DEFAULT_SCHEDULE, { closeOut: false, closeAt: "22:30" }).ok).toBe(true);
  });
});
