import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { loadLearning, logLearning, updateSkill } from "./learning.repo";

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

export function registerLearningTools(server: McpServer) {
  server.registerTool(
    "log_learning",
    {
      title: "Log learning",
      description:
        "Record a learning session: 'did 45 min of DSA, sliding window, 3 problems, still shaky'. A new skill is " +
        "created on first mention — choose its pillar: 'skills' for DSA/LeetCode/coding/craft, 'academic' for " +
        "coursework and exam prep, or another that fits. Ask how confident he feels (1 shaky – 5 solid) if he " +
        "doesn't say: it decides when the topic comes back for review. 1 XP per 5 minutes.",
      inputSchema: z
        .object({
          skill: z.string().trim().min(1).describe("e.g. DSA, Calculus, Spanish"),
          pillar: z.enum(PILLARS).optional().describe("Only used when creating a new skill. Default skills"),
          topic: z.string().trim().min(1).optional(),
          minutes: z.number().int().min(1).max(720),
          count: z.number().int().nonnegative().optional(),
          unit: z.string().trim().min(1).optional().describe("What count counts: problems, chapters, pages…"),
          confidence: z.number().int().min(1).max(5).optional(),
          notes: z.string().optional(),
          at: z.iso.datetime({ offset: true }).optional().describe("When, for backfilling. Default now"),
        })
        .refine((v) => v.unit === undefined || v.count !== undefined, "a unit needs a count"),
    },
    async (
      args: {
        skill: string;
        pillar?: (typeof PILLARS)[number];
        topic?: string;
        minutes: number;
        count?: number;
        unit?: string;
        confidence?: number;
        notes?: string;
        at?: string;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const logged = await logLearning(db, args);
        return ok(await withMode(db, new Date(), { ...logged }));
      } catch (error) {
        return toolError(`log_learning failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_learning",
    {
      title: "Get learning",
      description:
        "Progress on what he's learning: per skill, hours (total, last 7 and 30 days), streak, counts (e.g. " +
        "problems solved), topics covered, and topics due for review (spaced repetition by confidence). Use for " +
        "'what have I covered in DSA?', 'what should I review?', or to suggest today's practice.",
      inputSchema: z.object({ skill: z.string().trim().min(1).optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ skill }: { skill?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const progress = await loadLearning(db, now, skill);
        return ok(
          await withMode(db, now, {
            skills: progress.map(({ skill: s, summary: p }) => ({
              name: s.name,
              pillar: s.pillar,
              status: s.status,
              hours: { total: hours(p.totalMinutes), last7Days: hours(p.last7Minutes), last30Days: hours(p.last30Minutes) },
              sessions: p.sessions,
              lastPractised: p.lastPractised,
              streakDays: p.streakDays,
              counts: p.counts,
              topics: p.topics.map((t) => ({ topic: t.topic, sessions: t.sessions, minutes: t.minutes, lastPractised: t.lastPractised, confidence: t.confidence })),
              reviewDue: p.reviewDue.map((t) => ({ topic: t.topic, confidence: t.confidence, lastPractised: t.lastPractised })),
            })),
          }),
        );
      } catch (error) {
        return toolError(`get_learning failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_skill",
    {
      title: "Update skill",
      description: "Pause, resume, finish, rename, re-pillar, or link a skill to a goal (item id from list_items).",
      inputSchema: z.object({
        skill: z.string().trim().min(1),
        status: z.enum(["active", "paused", "done"]).optional(),
        pillar: z.enum(PILLARS).optional(),
        rename: z.string().trim().min(1).optional(),
        goal_item_id: z.uuid().nullable().optional(),
      }),
    },
    async (
      args: { skill: string; status?: "active" | "paused" | "done"; pillar?: (typeof PILLARS)[number]; rename?: string; goal_item_id?: string | null },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const outcome = await updateSkill(db, args.skill, { status: args.status, pillar: args.pillar, rename: args.rename, goalItemId: args.goal_item_id });
        return ok(await withMode(db, new Date(), { ...outcome }));
      } catch (error) {
        return toolError(`update_skill failed: ${(error as Error).message}`);
      }
    },
  );
}
