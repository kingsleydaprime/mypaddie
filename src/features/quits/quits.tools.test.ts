import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Quit } from "./quits.repo";
import { quitView, registerQuitTools } from "./quits.tools";

const quit = (over: Partial<Quit> = {}): Quit => ({
  id: "q1",
  title: "Porn",
  alias: "Project P",
  kind: "quit",
  unit: null,
  limitPerDay: null,
  status: "active",
  why: "it wrecks my mornings",
  onHome: false,
  showNameToAi: false,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  progress: { currentDays: 7, runStartedAt: new Date("2026-10-31T00:00:00Z"), longestDays: 9, totalCleanDays: 20, today: null },
  nextMilestone: { days: 14, daysLeft: 7 },
  ...over,
});

describe("what Paddie sees of a quit (D5)", () => {
  test("the alias, never the real name, by default", () => {
    const v = quitView(quit());
    expect(v.name).toBe("Project P");
    expect(v.realNameHidden).toBe(true);
    expect(JSON.stringify(v)).not.toContain("Porn");
  });

  test("with no alias, a neutral label", () => {
    expect(quitView(quit({ alias: null })).name).toBe("a habit you're quitting");
  });

  test("the why is hidden too, since it often names the habit", () => {
    expect(quitView(quit()).why).toBeUndefined();
    expect(quitView(quit({ showNameToAi: true })).why).toBe("it wrecks my mornings");
  });

  test("the real name only when they've let Paddie see it", () => {
    const v = quitView(quit({ showNameToAi: true }));
    expect(v.name).toBe("Porn");
    expect(v.realNameHidden).toBeUndefined();
  });

  test("cutting down shows the cap and today; a paused quit has no day count", () => {
    const v = quitView(quit({ kind: "limit", unit: "minutes", limitPerDay: 60, progress: { ...quit().progress, today: { used: 20, cap: 60, over: false } } }));
    expect(v.kind).toBe("cut_down");
    expect(v.cap).toEqual({ perDay: 60, unit: "minutes" });
    expect(v.today).toEqual({ used: 20, cap: 60, over: false });
    expect(quitView(quit({ status: "paused" })).daysClean).toBeNull();
  });

  test("milestones just paid come with their XP", () => {
    expect(quitView(quit(), [3, 7]).milestonesJustPaid).toEqual([{ day: 3, xp: 10 }, { day: 7, xp: 20 }]);
  });
});

test("registers the four quit tools", () => {
  const names: string[] = [];
  registerQuitTools({ registerTool: (name: string) => void names.push(name) } as unknown as McpServer);
  expect(names.sort()).toEqual(["get_quits", "log_relapse", "start_quit", "update_quit"]);
});
