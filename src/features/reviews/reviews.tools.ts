import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey } from "@/shared/time";
import { REVIEW_PERIODS, THEME_PERIODS, type ReviewPeriod, type ThemePeriod } from "./periods";
import { currentThemes, loadReviews, loadThemes, owedReviews, reviewDigest, saveReview, setTheme } from "./reviews.repo";

const today = () => dayKey(new Date(), currentConfig().timeZone);

export function registerReviewTools(server: McpServer) {
  server.registerTool(
    "prepare_review",
    {
      title: "Prepare a review",
      description:
        "Everything that actually happened in a week, month, quarter or year: tasks done, XP by pillar, XP lost to " +
        "ignored needs and broken promises, slips and their reasons, money in and out, study, workouts, people they " +
        "talked to, bucket-list ticks, achievements, energy, decisions, the theme they set, and what last review said " +
        "to change. Then the questions. Run the review as a conversation: share the facts briefly, ask the questions " +
        "one or two at a time, notice patterns (and offer to save them to About me), then write their report and save " +
        "it with save_review. Honest, warm, specific — never padded.",
      inputSchema: z.object({
        period: z.enum(REVIEW_PERIODS).default("week"),
        date: z.iso.date().optional().describe("Any day in the period; default today (or the period that just ended)"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ period, date }: { period: ReviewPeriod; date?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        // Default: the period owed right now, else the current one.
        const owed = (await owedReviews(db, new Date())).find((o) => o.period === period);
        return ok(await withMode(db, new Date(), { digest: await reviewDigest(db, period, date ?? owed?.start ?? today()) }));
      } catch (error) {
        return toolError(`prepare_review failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "save_review",
    {
      title: "Save a review",
      description:
        "Save a review: their answers by question key (did, avoided, grew, patterns, drained, energised, change — " +
        "longer reviews also proud, theme, people) in their words, and your report as `summary` (a short, honest " +
        "write-up: highlights, what slipped and why, patterns, and the one or two changes they chose). Saving again replaces it.",
      inputSchema: z.object({
        period: z.enum(REVIEW_PERIODS),
        date: z.iso.date().optional(),
        answers: z.record(z.string(), z.string().trim().max(2000)),
        summary: z.string().trim().max(8000).optional(),
      }),
    },
    async (args: { period: ReviewPeriod; date?: string; answers: Record<string, string>; summary?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const owed = (await owedReviews(db, new Date())).find((o) => o.period === args.period);
        return ok(await withMode(db, new Date(), { ...(await saveReview(db, { ...args, day: args.date ?? owed?.start ?? today() })) }));
      } catch (error) {
        return toolError(`save_review failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_reviews",
    {
      title: "Past reviews",
      description: "Their past reviews (newest first) — to spot patterns across weeks and months, and to hold them to what they said they'd change.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(60).default(8) }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }: { limit: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { reviews: await loadReviews(db, limit) }));
      } catch (error) {
        return toolError(`get_reviews failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "set_theme",
    {
      title: "Set a theme",
      description:
        "A theme for a year, quarter or month (\"Year of Discipline\", \"Month of Mercies\"): what to focus on and what " +
        "this season says no to (`not_now`). Help them choose it at the start of a period or after a review. When " +
        "something on `not_now` comes up — a new project, another commitment — point to the theme and push back.",
      inputSchema: z.object({
        period: z.enum(THEME_PERIODS),
        date: z.iso.date().optional().describe("Any day in that year/quarter/month; default today"),
        title: z.string().trim().min(1).max(100),
        focus: z.array(z.string().trim().min(1).max(200)).default([]),
        not_now: z.array(z.string().trim().min(1).max(200)).default([]),
        notes: z.string().trim().max(1000).optional(),
      }),
    },
    async (args: { period: ThemePeriod; date?: string; title: string; focus: string[]; not_now: string[]; notes?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await setTheme(db, { period: args.period, day: args.date ?? today(), title: args.title, focus: args.focus, notNow: args.not_now, notes: args.notes })) }));
      } catch (error) {
        return toolError(`set_theme failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_themes",
    {
      title: "Themes",
      description: "The year, quarter and month themes in force now, and past themes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { now: await currentThemes(db, now), all: await loadThemes(db) }));
      } catch (error) {
        return toolError(`get_themes failed: ${(error as Error).message}`);
      }
    },
  );
}
