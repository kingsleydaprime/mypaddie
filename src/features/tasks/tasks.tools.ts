import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { findCommitment } from "@/features/commitments/commitments.repo";
import { findCourseRef } from "@/features/courses/courses.repo";
import { findFun } from "@/features/fun/fun.repo";
import { findOrCreateSkill } from "@/features/learning/learning.repo";
import { currentConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";
import { loadTaskOverview } from "./overview.repo";
import { completeTask, createTask, deleteTask, habitRow, startTask, tickTaskStep, updateTask } from "./tasks.repo";

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
  "with force_clash=true) or pick another time. If it's 'over_capacity', their plate for that day is full: say so " +
  "plainly with the numbers, and offer to finish or drop something first, or move it to another day. `full: 'work'` " +
  "means their work hours are used up; `full: 'day'` means there's no waking time left at all. Do NOT suggest " +
  "raising capacity to squeeze it in — that's their deliberate setting (set_capacity).";

const CHECKLIST =
  "Steps inside one task, in order (an essay: outline, draft, edit). Ticked with tick_step. XP stays on the task as a " +
  "whole; ticking the last step doesn't complete it — ask if they're done, then complete_task.";

const SELF_CARE =
  "Self-care (looking after themselves: routines, workouts, hygiene, rest) takes time in the day but not from their " +
  "work hours (capacity). Default: false for a task, true for routine steps and workouts. Set it when the user says " +
  "what something is; don't guess.";

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description:
        "Schedule work: a one-off (a chore, an errand) or a recurring habit. Suggest pillar weights that sum to " +
        "100 (e.g. exercise: physical 50, mental 30, emotional 20) and let the user adjust them. Recurrence is " +
        "FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,WE,FR. Non-negotiables (daily essentials) get nudged until done. " +
        "Chores are low XP (about 5); normal tasks about 10. Estimate duration_minutes (the user can correct it): it " +
        "turns a timed task into a block and counts against their daily capacity. For something not urgent now but " +
        "that becomes non-negotiable later (replying someone, updating the boss), set becomes_must_do_at. " + REFUSALS,
      inputSchema: z.object({
        title: z.string().trim().min(1),
        item_id: z.uuid().optional().describe("The need/goal/etc. this task serves, from add_item or list_items"),
        base_xp: z.number().int().min(1).max(500).default(10),
        due_date: z.iso.date().optional().describe("YYYY-MM-DD, Lagos time. Default today"),
        due_time: time.optional().describe("HH:MM, Lagos time"),
        recurrence: z.string().optional(),
        non_negotiable: z.boolean().default(false),
        self_care: z.boolean().optional().describe(SELF_CARE),
        checklist: z.array(z.string().trim().min(1).max(200)).min(1).max(30).optional().describe(CHECKLIST),
        weights: weightsSchema,
        duration_minutes: z.number().int().min(1).max(1440).optional(),
        reminders: reminders.optional(),
        becomes_must_do_at: z.iso.datetime({ offset: true }).optional().describe("When it turns non-negotiable, e.g. 2026-10-15T09:00:00+01:00"),
        force_clash: z.boolean().default(false).describe("Only after the user confirms a double-booking"),
        skill: z.string().trim().min(1).optional().describe("Completing it logs practice time for this skill (e.g. 'LeetCode 1h' → DSA)"),
        topic: z.string().trim().min(1).max(200).optional().describe("With `skill`: the topic it covers (e.g. a course topic), recorded with the practice time"),
        fun: z.string().trim().min(1).optional().describe("Planned fun: the title of an activity on their fun list; completing the task counts as doing it"),
        commitment: z.string().trim().min(1).optional().describe("The job, role, team or group it's for (title or id from list_commitments), e.g. extra training before a competition"),
        course: z.string().trim().min(1).optional().describe("The course it's for (code, title or id from list_courses): an exam form, a group meeting, buying the textbook. For study sessions on a topic use accept_study_plan instead (they log study time)"),
        details: z.string().trim().max(2000).optional().describe("Steps, links, what done looks like — anything they'd want to read when they start it. Not the notification text (that's reminder_note)"),
        reminder_note: z.string().trim().max(200).optional().describe("Their own words for the notifications, e.g. 'Bring the signed form'"),
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
        self_care?: boolean;
        checklist?: string[];
        weights: { pillar: (typeof PILLARS)[number]; weight: number }[];
        duration_minutes?: number;
        reminders?: ("eve" | "morning" | "30" | "10")[];
        becomes_must_do_at?: string;
        force_clash: boolean;
        skill?: string;
        topic?: string;
        fun?: string;
        commitment?: string;
        course?: string;
        reminder_note?: string;
        details?: string;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const skillId = args.skill ? (await findOrCreateSkill(db, args.skill)).skill.id : null;
        const fun = args.fun ? await findFun(db, args.fun) : null;
        if (args.fun && !fun) return toolError(`add_task: "${args.fun}" isn't on their fun list — add it with add_fun first`);
        const commitment = args.commitment ? await findCommitment(db, args.commitment) : null;
        if (args.commitment && !commitment) return toolError(`add_task: no single commitment matches "${args.commitment}" — check list_commitments`);
        const course = args.course ? await findCourseRef(db, args.course) : null;
        if (args.course && !course) return toolError(`add_task: no single course matches "${args.course}" — check list_courses`);
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
            selfCare: args.self_care,
            checklist: args.checklist ?? null,
            weights: args.weights,
            durationMinutes: args.duration_minutes ?? null,
            reminders: args.reminders ?? null,
            mustFrom: args.becomes_must_do_at ? new Date(args.becomes_must_do_at) : null,
            forceClash: args.force_clash,
            skillId,
            topic: args.topic ?? null,
            funActivityId: fun?.id ?? null,
            commitmentId: commitment?.id ?? null,
            courseId: course?.id ?? null,
            reminderNote: args.reminder_note,
            details: args.details ?? null,
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
        "capacity. To change any recurring task, pass `habit` (its series_id from list_habits) instead of task_id: " +
        "it edits from the habit's next day on, even if that day isn't in the schedule yet. " + REFUSALS,
      inputSchema: z.object({
        task_id: z.uuid().optional().describe("One task (from get_today). Pass this or `habit`, not both"),
        habit: z.uuid().optional().describe("Any recurring task's series_id from list_habits; edits from its next day on"),
        action: z.enum(["edit", "cancel", "stop"]).default("edit"),
        title: z.string().trim().min(1).optional(),
        base_xp: z.number().int().min(1).max(500).optional(),
        due_date: z.iso.date().optional().describe("One-off tasks only. YYYY-MM-DD, Lagos time"),
        due_time: time.nullable().optional().describe("HH:MM Lagos, or null"),
        non_negotiable: z.boolean().optional(),
        self_care: z.boolean().optional().describe(SELF_CARE + " For a habit it applies from this day on; switching to work re-checks that day's work hours."),
        checklist: z.array(z.string().trim().max(200)).max(30).nullable().optional().describe(
          CHECKLIST + " Replaces the whole list in order; steps that stay keep their tick. null or [] clears it. For a habit, later days start unticked.",
        ),
        recurrence: z.string().optional().describe("Recurring habits only, e.g. FREQ=WEEKLY;BYDAY=MO,TH"),
        weights: weightsSchema.optional(),
        duration_minutes: z.number().int().min(1).max(1440).nullable().optional(),
        reminders: reminders.nullable().optional().describe("null = back to the default ladder"),
        becomes_must_do_at: z.iso.datetime({ offset: true }).nullable().optional(),
        force_clash: z.boolean().default(false),
        skill: z.string().trim().min(1).nullable().optional().describe("null = unlink"),
        reminder_note: z.string().trim().max(200).nullable().optional().describe("null = back to the default wording"),
        commitment: z.string().trim().min(1).nullable().optional().describe("The job, role or group it's for (from list_commitments); null = unlink"),
        course: z.string().trim().min(1).nullable().optional().describe("The course it's for (from list_courses); null = unlink"),
        details: z.string().trim().max(2000).nullable().optional().describe("Steps, links, what done looks like; for a habit it applies from this day on. null = clear"),
      }),
    },
    async (
      args: {
        task_id?: string;
        habit?: string;
        action: "edit" | "cancel" | "stop";
        title?: string;
        base_xp?: number;
        due_date?: string;
        due_time?: string | null;
        non_negotiable?: boolean;
        self_care?: boolean;
        checklist?: string[] | null;
        recurrence?: string;
        weights?: { pillar: (typeof PILLARS)[number]; weight: number }[];
        duration_minutes?: number | null;
        reminders?: ("eve" | "morning" | "30" | "10")[] | null;
        becomes_must_do_at?: string | null;
        force_clash: boolean;
        skill?: string | null;
        reminder_note?: string | null;
        commitment?: string | null;
        course?: string | null;
        details?: string | null;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const commitment = args.commitment ? await findCommitment(db, args.commitment) : null;
        if (args.commitment && !commitment) return toolError(`update_task: no single commitment matches "${args.commitment}" — check list_commitments`);
        const course = args.course ? await findCourseRef(db, args.course) : null;
        if (args.course && !course) return toolError(`update_task: no single course matches "${args.course}" — check list_courses`);
        if ((args.task_id === undefined) === (args.habit === undefined)) return toolError("update_task: pass either task_id or habit (from list_habits), not both or neither");
        const taskId = args.task_id ?? (await habitRow(db, args.habit!, new Date()));
        if (!taskId) return toolError("update_task: no such habit, or it has ended — check list_habits");
        const skillId = args.skill === undefined ? undefined : args.skill === null ? null : (await findOrCreateSkill(db, args.skill)).skill.id;
        const outcome = await updateTask(
          db,
          taskId,
          {
            title: args.title,
            baseXp: args.base_xp,
            dueDate: args.due_date,
            dueTime: args.due_time,
            nonNegotiable: args.non_negotiable,
            selfCare: args.self_care,
            checklist: args.checklist,
            recurrence: args.recurrence,
            weights: args.weights,
            durationMinutes: args.duration_minutes,
            reminders: args.reminders,
            mustFrom: args.becomes_must_do_at === undefined ? undefined : args.becomes_must_do_at ? new Date(args.becomes_must_do_at) : null,
            forceClash: args.force_clash,
            skillId,
            reminderNote: args.reminder_note,
            commitmentId: args.commitment === undefined ? undefined : commitment?.id ?? null,
            courseId: args.course === undefined ? undefined : course?.id ?? null,
            details: args.details,
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
    "list_habits",
    {
      title: "Recurring tasks",
      description:
        "Every recurring task — anything with a repeat rule, not only habits: weekly meetings, church, classes, " +
        "workout days, daily habits. Routine steps are listed under list_routines instead. Gives series_id, title, " +
        "how often, when next, and whether it's self-care. To change one, call update_task with habit=<series_id>; never guess ids.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const today = dayKey(now, currentConfig().timeZone);
        const { habits } = await loadTaskOverview(db, now);
        return ok(
          await withMode(db, now, {
            habits: habits.map((h) => ({
              series_id: h.seriesId,
              title: h.title,
              repeats: h.rule,
              next: h.next ? `${h.next.day}${h.next.time ? ` ${h.next.time}` : " (any time)"}${h.next.day === today ? " — today" : ""}` : null,
              self_care: h.selfCare,
            })),
          }),
        );
      } catch (error) {
        return toolError(`list_habits failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "start_task",
    {
      title: "Start or stop a task",
      description:
        "Mark a task in progress when they say they're starting it ('starting the report now'): its own reminders go " +
        "quiet and Today puts it first, and when they finish, complete_task reports how long it really took. stop=true " +
        "when they stop for now without finishing. Other must-dos still nudge.",
      inputSchema: z.object({ task_id: z.uuid().describe("From get_today"), stop: z.boolean().default(false) }),
    },
    async ({ task_id, stop }: { task_id: string; stop: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await startTask(db, task_id, now, stop)) }));
      } catch (error) {
        return toolError(`start_task failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tick_step",
    {
      title: "Tick a checklist step",
      description:
        "Tick (or untick with done=false) one step of a task's checklist, by its number from 1 or its words. If " +
        "`allDone` comes back true, ask whether the task itself is done — don't complete it for them.",
      inputSchema: z.object({
        task_id: z.uuid(),
        step: z.union([z.number().int().min(1), z.string().trim().min(1)]),
        done: z.boolean().default(true),
      }),
    },
    async ({ task_id, step, done }: { task_id: string; step: number | string; done: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await tickTaskStep(db, task_id, step, done)) }));
      } catch (error) {
        return toolError(`tick_step failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete task",
      description:
        "Permanently delete a task added by mistake (a typo, a duplicate). Only works for tasks with no history — " +
        "no XP earned or lost, no slips. If the result is 'has_history', it's part of their record: use update_task " +
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
        "late over not at all. Safe to retry: a task can't pay twice. Use the task id from get_today. For a study " +
        "task (one with a topic), ask how solid the topic feels now (1–5) and pass it as `confidence`: it decides " +
        "when the topic comes back for review. If it was started, `tookMinutes` says how long it really took " +
        "(vs `plannedMinutes`): mention it only when it's well off the plan, as something to plan with next time.",
      inputSchema: z.object({
        task_id: z.uuid().describe("Task id from get_today"),
        confidence: z.number().int().min(1).max(5).optional().describe("Study tasks: how solid the topic feels now, 1 shaky – 5 solid"),
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
    },
    async ({ task_id, confidence }: { task_id: string; confidence?: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await completeTask(db, task_id, now, undefined, { confidence })) }));
      } catch (error) {
        return toolError(`complete_task failed: ${(error as Error).message}`);
      }
    },
  );
}
