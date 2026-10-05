import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { loadStats } from "./stats.repo";

export function registerStatsTools(server: McpServer) {
  server.registerTool(
    "get_stats",
    {
      title: "Get stats",
      description:
        "The 11 pillars with XP and levels, XP gained per pillar over the last 7 days, and recent slip patterns. " +
        "Only call when Kingsley asks about stats or progress — never open a chat with numbers.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, await loadStats(db, now)));
      } catch (error) {
        return toolError(`get_stats failed: ${(error as Error).message}`);
      }
    },
  );
}
