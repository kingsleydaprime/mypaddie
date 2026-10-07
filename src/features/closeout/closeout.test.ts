import { describe, expect, test } from "bun:test";
import { checkDecision, closeOutXp, CLOSE_OUT_XP, dayRead, optionsFor, reasonAccepted, sweep, type OpenTask } from "./closeout";

const t = (extra: Partial<OpenTask>): OpenTask => ({ id: "x", title: "Task", day: "2026-10-07", isNeed: false, isHabit: false, status: "pending", ...extra });
const today = "2026-10-07";

describe("sweep", () => {
  test("pending tasks due today or earlier, oldest first, with how long they've waited", () => {
    const s = sweep([
      t({ id: "a", title: "Today", day: "2026-10-07" }),
      t({ id: "b", title: "Old", day: "2026-10-03" }),
      t({ id: "c", title: "Tomorrow", day: "2026-10-08" }),
      t({ id: "d", title: "Undated", day: null }),
      t({ id: "e", title: "Slipped already", status: "skipped" }),
    ], today);
    expect(s.map((x) => [x.id, x.overdueDays])).toEqual([["b", 4], ["a", 0]]);
  });
});

describe("options", () => {
  test("a one-off: move, drop or slipped", () => {
    expect(optionsFor({ isNeed: false, isHabit: false })).toEqual(["move", "drop", "slipped"]);
  });
  test("a need can't just be dropped", () => {
    expect(optionsFor({ isNeed: true, isHabit: false })).toEqual(["move", "slipped"]);
  });
  test("a habit's missed day can only be explained (tomorrow has its own)", () => {
    expect(optionsFor({ isNeed: false, isHabit: true })).toEqual(["slipped"]);
    expect(optionsFor({ isNeed: true, isHabit: true })).toEqual(["slipped"]);
  });
});

describe("checkDecision", () => {
  test("moving forward is fine; moving to today or the past isn't", () => {
    expect(checkDecision({ isNeed: false, isHabit: false }, { kind: "move", to: "2026-10-08" }, today)).toEqual({ ok: true });
    expect(checkDecision({ isNeed: false, isHabit: false }, { kind: "move", to: today }, today)).toEqual({ ok: false, reason: "move_to_past" });
  });
  test("dropping a need is refused", () => {
    expect(checkDecision({ isNeed: true, isHabit: false }, { kind: "drop" }, today)).toEqual({ ok: false, reason: "not_allowed" });
  });
  test("a slip needs a reason", () => {
    expect(checkDecision({ isNeed: false, isHabit: true }, { kind: "slipped", why: " ", category: "tired" }, today)).toEqual({ ok: false, reason: "empty_reason" });
    expect(checkDecision({ isNeed: false, isHabit: true }, { kind: "slipped", why: "Power cut", category: "power" }, today)).toEqual({ ok: true });
  });
});

describe("closeOutXp", () => {
  test("a small fixed reward that adds up", () => {
    expect(closeOutXp().reduce((s, e) => s + e.amount, 0)).toBe(CLOSE_OUT_XP);
  });
});

describe("dayRead", () => {
  test("share done, and a nudge to shrink what keeps getting moved", () => {
    const r = dayRead(3, [{ title: "Essay", overdueDays: 4 }, { title: "Call mum", overdueDays: 0 }]);
    expect(r.share).toBe(60);
    expect(r.carriedOver).toEqual(["Essay"]);
    expect(r.hint).toContain("shrink");
  });
  test("an empty day has no share", () => {
    expect(dayRead(0, []).share).toBeNull();
  });
  test("all done", () => {
    expect(dayRead(4, []).hint).toContain("win");
  });
});

describe("reasonAccepted", () => {
  test("real reasons protect a need; the rest don't; unknown ones don't", () => {
    expect(reasonAccepted("sick")).toBe(true);
    expect(reasonAccepted("No power or data")).toBe(true);
    expect(reasonAccepted("tired")).toBe(false);
    expect(reasonAccepted("vibes")).toBe(false);
  });
});
