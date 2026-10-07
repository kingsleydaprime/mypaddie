import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS, TIERS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addItem, completeItem, deleteItem, listItems, setItemStatus, updateItem } from "./items.repo";

const amount = z.number().int().nonnegative();
const weightsSchema = z
  .array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) }))
  .min(1)
  .refine((ws) => ws.reduce((s, w) => s + w.weight, 0) === 100, "weights must sum to 100");

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

  server.registerTool(
    "update_item",
    {
      title: "Update item",
      description:
        "Change an item (from list_items): title, target, deadline, priority, money amounts, or move it to another tier " +
        "(a want that became a need, a wish that got a deadline and became a goal). Moving off 'need' clears the amounts. " +
        "Pass null to clear target or deadline. To pause, drop or reopen it use set_item_status; to finish it, complete_item.",
      inputSchema: z.object({
        item_id: z.uuid(),
        tier: z.enum(TIERS).optional(),
        title: z.string().trim().min(1).optional(),
        target: z.string().nullable().optional(),
        deadline: z.iso.date().nullable().optional().describe("YYYY-MM-DD, or null to clear"),
        priority: z.number().int().optional(),
        floor_amount: amount.nullable().optional(),
        comfortable_amount: amount.nullable().optional(),
      }),
    },
    async (args: {
      item_id: string;
      tier?: (typeof TIERS)[number];
      title?: string;
      target?: string | null;
      deadline?: string | null;
      priority?: number;
      floor_amount?: number | null;
      comfortable_amount?: number | null;
    }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const data = await updateItem(db, args.item_id, {
          tier: args.tier,
          title: args.title,
          target: args.target,
          deadline: args.deadline,
          priority: args.priority,
          floorAmount: args.floor_amount,
          comfortableAmount: args.comfortable_amount,
        });
        return ok(await withMode(db, new Date(), data));
      } catch (error) {
        return toolError(`update_item failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "complete_item",
    {
      title: "Complete item",
      description:
        "Mark an item done. A goal pays a bonus of 2× its last task's XP; a wish happening pays +50. Each pays once, ever. " +
        "The bonus goes to the pillars the item's tasks fed; if the result is 'needs_weights' (no tasks to go on), ask " +
        "which pillars it served and call again with weights summing to 100. Needs, wants and dreams just close (a dream " +
        "pays through its milestones: add_milestone / achieve_milestone). Celebrate a finished goal properly.",
      inputSchema: z.object({
        item_id: z.uuid(),
        weights: weightsSchema.optional(),
        done_on: z.iso.date().optional().describe("YYYY-MM-DD if it was finished on an earlier day"),
      }),
    },
    async (args: { item_id: string; weights?: { pillar: (typeof PILLARS)[number]; weight: number }[]; done_on?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const doneAt = args.done_on ? new Date(`${args.done_on}T12:00:00Z`) : undefined;
        const data = await completeItem(db, args.item_id, { weights: args.weights, doneAt });
        return ok(await withMode(db, new Date(), data));
      } catch (error) {
        return toolError(`complete_item failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "set_item_status",
    {
      title: "Pause, drop or reopen item",
      description:
        "'paused' = not now, keep it; 'dropped' = decided against it (no penalty, deciding is a skill); 'active' = " +
        "resume or reopen (also undoes a mistaken complete_item, though the bonus is never paid twice). A dropped goal " +
        "is worth a sentence on why, saved with save_memory, if they offer one.",
      inputSchema: z.object({ item_id: z.uuid(), status: z.enum(["active", "paused", "dropped"]) }),
    },
    async (args: { item_id: string; status: "active" | "paused" | "dropped" }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const data = await setItemStatus(db, args.item_id, args.status);
        return ok(await withMode(db, new Date(), data));
      } catch (error) {
        return toolError(`set_item_status failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "delete_item",
    {
      title: "Delete item",
      description:
        "Delete an item added by mistake (a typo, a duplicate). Refused with 'has_history' once it has tasks or XP: " +
        "drop it with set_item_status instead, so the record stays.",
      inputSchema: z.object({ item_id: z.uuid() }),
      annotations: { destructiveHint: true },
    },
    async (args: { item_id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const data = await deleteItem(db, args.item_id);
        return ok(await withMode(db, new Date(), data));
      } catch (error) {
        return toolError(`delete_item failed: ${(error as Error).message}`);
      }
    },
  );
}
