import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { findOrCreateSkill } from "@/features/learning/learning.repo";
import { completeTask, createTask, deleteTask, updateTask } from "./tasks.repo";

const weightsSchema = z
  .array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) }))
  .min(1)
  .refine((ws) => ws.reduce((s, w) => s + w.weight, 0) === 100, "weights must sum to 100");

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const reminders = z.array(z.enum(["eve", "morning", "30", "10"])).describe(
  "Which reminders: 'eve' (the evening before, 20:00), 'morning' (09:00 that day), '30' and '10' (minutes before). " +
    "Omit for the default: one-off timed tasks get all four, habits only '10'. [] = none.",
);
const REFUSALS =
  "If the result is 'clash', say what's already there and when, and ask whether to book it anyway (then retry " +
  "with force_clash=true) or pick another time. If it's 'over_capacity', his plate for that day is full: say so " +
  "plainly with the numbers, and offer to finish or drop something first, or move it to another day. Do NOT suggest " +
  "raising capacity to squeeze it in — that's his deliberate setting (set_capacity).";

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description:
        "Schedule work: a one-off (a chore, an errand) or a recurring habit. Suggest pillar weights that sum to " +
        "100 (e.g. exercise: physical 50, mental 30, emotional 20) and let Kingsley adjust them. Recurrence is " +
        "FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,WE,FR. Non-negotiables (daily essentials) get nudged until done. " +
        "Chores are low XP (about 5); normal tasks about 10. Estimate duration_minutes (he can correct it): it " +
        "turns a timed task into a block and counts against his daily capacity. For something not urgent now but " +
        "that becomes non-negotiable later (replying someone, updating the boss), set becomes_must_do_at. " + REFUSALS,
      inputSchema: z.object({
        title: z.string().trim().min(1),
        item_id: z.uuid().optional().describe("The need/goal/etc. this task serves, from add_item or list_items"),
        base_xp: z.number().int().min(1).max(500).default(10),
        due_date: z.iso.date().optional().describe("YYYY-MM-DD, Lagos time. Default today"),
        due_time: time.optional().describe("HH:MM, Lagos time"),
        recurrence: z.string().optional(),
        non_negotiable: z.boolean().default(false),
        weights: weightsSchema,
        duration_minutes: z.number().int().min(1).max(1440).optional(),
        reminders: reminders.optional(),
        becomes_must_do_at: z.iso.datetime({ offset: true }).optional().describe("When it turns non-negotiable, e.g. 2026-10-15T09:00:00+01:00"),
        force_clash: z.boolean().default(false).describe("Only after he confirms a double-booking"),
        skill: z.string().trim().min(1).optional().describe("Completing it logs practice time for this skill (e.g. 'LeetCode 1h' → DSA)"),
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
        duration_minutes?: number;
        reminders?: ("eve" | "morning" | "30" | "10")[];
        becomes_must_do_at?: string;
        force_clash: boolean;
        skill?: string;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const skillId = args.skill ? (await findOrCreateSkill(db, args.skill)).skill.id : null;
        const outcome = await createTask(
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
            durationMinutes: args.duration_minutes ?? null,
            reminders: args.reminders ?? null,
            mustFrom: args.becomes_must_do_at ? new Date(args.becomes_must_do_at) : null,
            forceClash: args.force_clash,
            skillId,
          },
          now,
        );
        return ok(await withMode(db, now, { ...outcome }));
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
        "be changed. Pass due_time=null to make it 'any time'. Moving or lengthening a task re-checks clashes and " +
        "capacity. " + REFUSALS,
      inputSchema: z.object({
        task_id: z.uuid(),
        action: z.enum(["edit", "cancel", "stop"]).default("edit"),
        title: z.string().trim().min(1).optional(),
        base_xp: z.number().int().min(1).max(500).optional(),
        due_date: z.iso.date().optional().describe("One-off tasks only. YYYY-MM-DD, Lagos time"),
        due_time: time.nullable().optional().describe("HH:MM Lagos, or null"),
        non_negotiable: z.boolean().optional(),
        recurrence: z.string().optional().describe("Recurring habits only, e.g. FREQ=WEEKLY;BYDAY=MO,TH"),
        weights: weightsSchema.optional(),
        duration_minutes: z.number().int().min(1).max(1440).nullable().optional(),
        reminders: reminders.nullable().optional().describe("null = back to the default ladder"),
        becomes_must_do_at: z.iso.datetime({ offset: true }).nullable().optional(),
        force_clash: z.boolean().default(false),
        skill: z.string().trim().min(1).nullable().optional().describe("null = unlink"),
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
        duration_minutes?: number | null;
        reminders?: ("eve" | "morning" | "30" | "10")[] | null;
        becomes_must_do_at?: string | null;
        force_clash: boolean;
        skill?: string | null;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const skillId = args.skill === undefined ? undefined : args.skill === null ? null : (await findOrCreateSkill(db, args.skill)).skill.id;
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
            durationMinutes: args.duration_minutes,
            reminders: args.reminders,
            mustFrom: args.becomes_must_do_at === undefined ? undefined : args.becomes_must_do_at ? new Date(args.becomes_must_do_at) : null,
            forceClash: args.force_clash,
            skillId,
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
    "delete_task",
    {
      title: "Delete task",
      description:
        "Permanently delete a task added by mistake (a typo, a duplicate). Only works for tasks with no history — " +
        "no XP earned or lost, no slips. If the result is 'has_history', it's part of his record: use update_task " +
        "with action 'cancel' (skip it) or 'stop' (end a habit) instead.",
      inputSchema: z.object({ task_id: z.uuid() }),
      annotations: { destructiveHint: true },
    },
    async ({ task_id }: { task_id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await deleteTask(db, task_id)) }));
      } catch (error) {
        return toolError(`delete_task failed: ${(error as Error).message}`);
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
