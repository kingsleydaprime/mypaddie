import { describe, expect, test } from "bun:test";
import { levelFor, levelProgress, xpForLevel } from "./levels";

describe("levels", () => {
  test.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [399, 2],
    [400, 3],
    [900, 4],
    [1600, 5],
  ])("%p XP is level %p", (xp, level) => {
    expect(levelFor(xp)).toBe(level);
  });

  test("negative XP (more deductions than gains) floors at level 1", () => {
    expect(levelFor(-50)).toBe(1);
    expect(levelProgress(-50)).toMatchObject({ level: 1, toNext: 100, progress: 0 });
  });

  test("levelFor and xpForLevel agree at every boundary", () => {
    for (let l = 1; l <= 30; l++) {
      expect(levelFor(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFor(xpForLevel(l) - 1)).toBe(l - 1);
    }
  });

  test("progress through a level", () => {
    expect(levelProgress(250)).toEqual({ level: 2, xp: 250, toNext: 150, progress: 0.5 });
  });
});
