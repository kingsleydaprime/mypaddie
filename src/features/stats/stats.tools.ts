import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { levelProgress } from "./levels";

export function registerStatsTools(server: McpServer) {
  server.registerTool(
    "get_stats",
    {
      title: "Get stats",
      description:
        "The ten pillars with XP and levels, XP gained per pillar over the last 7 days, and recent slip patterns. " +
        "Only call when Kingsley asks about stats or progress — never open a chat with numbers.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
        const fortnight = new Date(now.getTime() - 14 * 86_400_000).toISOString();
        const [pillars, recent, slips] = await Promise.all([
          db.from("pillars").select("name, xp"),
          db.from("xp_log").select("pillar, amount").gte("at", week),
          db.from("slips").select("why_category").gte("at", fortnight),
        ]);
        for (const res of [pillars, recent, slips]) if (res.error) return toolError(`get_stats failed: ${res.error.message}`);

        const totals = new Map(pillars.data!.map((p) => [p.name, p.xp]));
        const lastWeek = new Map<string, number>();
        for (const r of recent.data!) lastWeek.set(r.pillar, (lastWeek.get(r.pillar) ?? 0) + r.amount);

        const categories = new Map<string, number>();
        for (const s of slips.data!) {
          const c = s.why_category ?? "unspecified";
          categories.set(c, (categories.get(c) ?? 0) + 1);
        }

        return ok(
          await withMode(db, now, {
            pillars: PILLARS.map((name) => ({ name, ...levelProgress(totals.get(name) ?? 0), lastWeek: lastWeek.get(name) ?? 0 })),
            slipsLast14Days: {
              count: slips.data!.length,
              topReasons: [...categories].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, times]) => ({ reason, times })),
            },
          }),
        );
      } catch (error) {
        return toolError(`get_stats failed: ${(error as Error).message}`);
      }
    },
  );
}
