import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { loadDecisions, logDecision, removeDecision, reviewDecision, VERDICTS, type Verdict } from "./decisions.repo";

export function registerDecisionTools(server: McpServer) {
  server.registerTool(
    "log_decision",
    {
      title: "Log a decision",
      description:
        "A significant decision, so future-them can check it: what they decided, why, what they expect to happen, and " +
        "when to look back (default 30 days; null = never). Offer this when they make a real call — quitting something, " +
        "a big purchase, a new direction.",
      inputSchema: z.object({
        decision: z.string().trim().min(1).max(300),
        why: z.string().trim().max(2000).optional(),
        expected: z.string().trim().max(1000).optional(),
        review_in_days: z.number().int().min(1).max(730).nullable().optional(),
      }),
    },
    async (args: { decision: string; why?: string; expected?: string; review_in_days?: number | null }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await logDecision(db, { ...args, reviewInDays: args.review_in_days }, now)) }));
      } catch (error) {
        return toolError(`log_decision failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_decisions",
    {
      title: "Decisions",
      description: "Their decision log: why, what they expected, and how it turned out. `dueForReview` = time to look back — ask how it went.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { decisions: await loadDecisions(db, now) }));
      } catch (error) {
        return toolError(`list_decisions failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "review_decision",
    {
      title: "Review a decision",
      description: "How a decision turned out (id from list_decisions): worked, partly, or didn't — and what happened. `remove` deletes one logged by mistake.",
      inputSchema: z.object({ id: z.uuid(), verdict: z.enum(VERDICTS).optional(), outcome: z.string().trim().max(2000).optional(), remove: z.boolean().optional() }),
    },
    async (args: { id: string; verdict?: Verdict; outcome?: string; remove?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        if (args.remove) return ok(await withMode(db, now, { ...(await removeDecision(db, args.id, now)) }));
        if (!args.verdict) return toolError("review_decision: say how it went (verdict)");
        return ok(await withMode(db, now, { ...(await reviewDecision(db, args.id, { verdict: args.verdict, outcome: args.outcome }, now)) }));
      } catch (error) {
        return toolError(`review_decision failed: ${(error as Error).message}`);
      }
    },
  );
}
