import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { checkAchievements, loadAchievements } from "./achievements.repo";

export function registerAchievementTools(server: McpServer) {
  server.registerTool(
    "get_achievements",
    {
      title: "Achievements",
      description: "Every achievement: earned (when, and for what) and still to earn. get_today already announces new ones — celebrate those properly.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const fresh = await checkAchievements(db, now);
        return ok(await withMode(db, now, { ...(fresh.length ? { justEarned: fresh } : {}), achievements: await loadAchievements(db) }));
      } catch (error) {
        return toolError(`get_achievements failed: ${(error as Error).message}`);
      }
    },
  );
}
