import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { completeTask, createTask, updateTask } from "./tasks.repo";

const weightsSchema = z
  .array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) }))
  .min(1)
  .refine((ws) => ws.reduce((s, w) => s + w.weight, 0) === 100, "weights must sum to 100");

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description:
        "Schedule work: a one-off (a chore, an errand) or a recurring habit. Suggest pillar weights that sum to " +
        "100 (e.g. exercise: physical 50, mental 30, emotional 20) and let Kingsley adjust them. Recurrence is " +
        "FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,WE,FR. Non-negotiables (daily essentials) get nudged until done. " +
        "Chores are low XP (about 5); normal tasks about 10.",
      inputSchema: z.object({
        title: z.string().trim().min(1),
        item_id: z.uuid().optional().describe("The need/goal/etc. this task serves, from add_item or list_items"),
        base_xp: z.number().int().min(1).max(500).default(10),
        due_date: z.iso.date().optional().describe("YYYY-MM-DD, Lagos time. Default today"),
        due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:MM, Lagos time"),
        recurrence: z.string().optional(),
        non_negotiable: z.boolean().default(false),
        weights: weightsSchema,
      }),
    },
    async (
      args: {
        title: string;
        item_id?: string;
        base_xp: number;
        due_date?: string;
        due_time?: string;
        recurrence?: string;
        non_negotiable: boolean;
        weights: { pillar: (typeof PILLARS)[number]; weight: number }[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const task = await createTask(
          db,
          {
            title: args.title,
            itemId: args.item_id ?? null,
            baseXp: args.base_xp,
            dueDate: args.due_date ?? null,
            dueTime: args.due_time ?? null,
            recurrence: args.recurrence ?? null,
            nonNegotiable: args.non_negotiable,
            weights: args.weights,
          },
          now,
        );
        return ok(await withMode(db, now, { task }));
      } catch (error) {
        return toolError(`add_task failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Edit, cancel, or stop a task. action='edit' changes only the fields you pass; for a recurring habit it " +
        "applies to that day and every later day. action='cancel' skips just this one (no XP penalty — a " +
        "deliberate decision isn't ignoring it). action='stop' ends a recurring habit entirely. Done tasks can't " +
        "be changed. Pass due_time=null to make it 'any time'.",
      inputSchema: z.object({
        task_id: z.uuid(),
        action: z.enum(["edit", "cancel", "stop"]).default("edit"),
        title: z.string().trim().min(1).optional(),
        base_xp: z.number().int().min(1).max(500).optional(),
        due_date: z.iso.date().optional().describe("One-off tasks only. YYYY-MM-DD, Lagos time"),
        due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe("HH:MM Lagos, or null"),
        non_negotiable: z.boolean().optional(),
        recurrence: z.string().optional().describe("Recurring habits only, e.g. FREQ=WEEKLY;BYDAY=MO,TH"),
        weights: weightsSchema.optional(),
      }),
    },
    async (
      args: {
        task_id: string;
        action: "edit" | "cancel" | "stop";
        title?: string;
        base_xp?: number;
        due_date?: string;
        due_time?: string | null;
        non_negotiable?: boolean;
        recurrence?: string;
        weights?: { pillar: (typeof PILLARS)[number]; weight: number }[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const outcome = await updateTask(
          db,
          args.task_id,
          {
            title: args.title,
            baseXp: args.base_xp,
            dueDate: args.due_date,
            dueTime: args.due_time,
            nonNegotiable: args.non_negotiable,
            recurrence: args.recurrence,
            weights: args.weights,
          },
          args.action,
        );
        return ok(await withMode(db, new Date(), { ...outcome }));
      } catch (error) {
        return toolError(`update_task failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description:
        "Mark a task done and award its weighted XP. Late completions still earn reduced XP, so encourage doing it " +
        "late over not at all. Safe to retry: a task can't pay twice. Use the task id from get_today.",
      inputSchema: z.object({ task_id: z.uuid().describe("Task id from get_today") }),
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
    },
    async ({ task_id }: { task_id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await completeTask(db, task_id, now)) }));
      } catch (error) {
        return toolError(`complete_task failed: ${(error as Error).message}`);
      }
    },
  );
}
