import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { TIERS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addItem, listItems } from "./items.repo";

const amount = z.number().int().nonnegative();

export function registerItemTools(server: McpServer) {
  server.registerTool(
    "add_item",
    {
      title: "Add item",
      description:
        "Add something the user needs, wants, or is working toward. Tiers: need (non-negotiable, funded first), " +
        "want, goal (has a target and deadline), wish (no deadline yet, zero guilt), dream (big, broken into goals). " +
        "For needs, give monthly floor (cheapest honest version) and comfortable (current spend) amounts in their currency " +
        "if money is involved. To schedule the work for an item, follow up with add_task.",
      inputSchema: z.object({
        tier: z.enum(TIERS),
        title: z.string().trim().min(1),
        target: z.string().optional().describe("For goals: what done looks like"),
        deadline: z.iso.date().optional().describe("YYYY-MM-DD"),
        priority: z.number().int().optional().describe("Needs only: lower is funded first in deficit. Default 100"),
        floor_amount: amount.optional(),
        comfortable_amount: amount.optional(),
      }),
    },
    async (args: {
      tier: (typeof TIERS)[number];
      title: string;
      target?: string;
      deadline?: string;
      priority?: number;
      floor_amount?: number;
      comfortable_amount?: number;
    }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const data = await addItem(db, {
          tier: args.tier,
          title: args.title,
          target: args.target,
          deadline: args.deadline,
          priority: args.priority,
          floorAmount: args.floor_amount,
          comfortableAmount: args.comfortable_amount,
        });
        return ok(await withMode(db, new Date(), { item: data }));
      } catch (error) {
        return toolError(`add_item failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_items",
    {
      title: "List items",
      description: "List items, optionally filtered by tier and status (default: active).",
      inputSchema: z.object({
        tier: z.enum(TIERS).optional(),
        status: z.enum(["active", "done", "paused", "dropped"]).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args: { tier?: (typeof TIERS)[number]; status?: "active" | "done" | "paused" | "dropped" }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const data = await listItems(db, { tier: args.tier, status: args.status });
        return ok(await withMode(db, new Date(), { items: data }));
      } catch (error) {
        return toolError(`list_items failed: ${(error as Error).message}`);
      }
    },
  );
}
