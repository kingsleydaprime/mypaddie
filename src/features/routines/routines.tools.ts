import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { createRoutine, loadRoutines, stopRoutine, updateRoutine } from "./routines.repo";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function registerRoutineTools(server: McpServer) {
  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description:
        "A routine: habits that belong together (morning routine, night routine, before study), in order. Each step is " +
        "its own habit (XP and reminders per step) but Today shows the routine as one item — \"Morning routine · next: " +
        "Brush (2/5)\" — and it counts as one habit for plan limits. With `time`, steps follow one another from then. " +
        "All or nothing: if any step won't fit (result 'refused', with `step` and `reason`: over_capacity with that day's room, " +
        "or clash), NOTHING was saved — tell them which step and why, and offer a fix (fewer or shorter steps, another time, more capacity).",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(100),
        steps: z.array(z.object({
          title: z.string().trim().min(1).max(200),
          minutes: z.number().int().min(1).max(240).optional(),
          weights: z.array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) })).optional(),
        })).min(1).max(20),
        recurrence: z.string().default("FREQ=DAILY").describe("FREQ=DAILY, or FREQ=WEEKLY;BYDAY=MO,TU…; UNTIL=YYYYMMDD to end it"),
        time: time.optional(),
        must_do: z.boolean().default(true).describe("Non-negotiable steps get firmer nudges"),
        start_date: z.iso.date().optional(),
      }),
    },
    async (args: { title: string; steps: { title: string; minutes?: number; weights?: { pillar: (typeof PILLARS)[number]; weight: number }[] }[]; recurrence: string; time?: string; must_do: boolean; start_date?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await createRoutine(db, { title: args.title, steps: args.steps, recurrence: args.recurrence, time: args.time, nonNegotiable: args.must_do, startDate: args.start_date }, now)) }));
      } catch (error) {
        return toolError(`create_routine failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_routines",
    {
      title: "Routines",
      description: "Their routines and steps. To add, remove, reorder or retime steps or rename it, use update_routine; to change one step's details (title, length, pillars), update_task on that step.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { routines: await loadRoutines(db) }));
      } catch (error) {
        return toolError(`list_routines failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "stop_routine",
    {
      title: "Stop routine",
      description: "Stop a routine (by title): all its steps stop; past days stay as history.",
      inputSchema: z.object({ routine: z.string().trim().min(1) }),
    },
    async ({ routine }: { routine: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await stopRoutine(db, routine, now)) }));
      } catch (error) {
        return toolError(`stop_routine failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description:
        "Change a routine (by title) without losing its history: rename it, remove steps (by title; their habits stop), " +
        "add steps (at the end, or wherever `order` puts them), reorder (`order` must name every remaining step once), " +
        "or move the start `time` (null = any time that day). Steps keep running back to back from the start. A " +
        "'refused' result says which step was unknown, duplicated or missing from the order. Steps in `notAdded` were " +
        "turned away (the day was full, usually) and are NOT in the routine — say so; never report them as added.",
      inputSchema: z.object({
        routine: z.string().trim().min(1),
        title: z.string().trim().min(1).max(100).optional(),
        remove: z.array(z.string().trim().min(1)).optional(),
        add: z.array(z.object({
          title: z.string().trim().min(1).max(200),
          minutes: z.number().int().min(1).max(240).optional(),
          weights: z.array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) })).optional(),
        })).max(20).optional(),
        order: z.array(z.string().trim().min(1)).optional(),
        time: time.nullable().optional(),
      }),
    },
    async (args: {
      routine: string;
      title?: string;
      remove?: string[];
      add?: { title: string; minutes?: number; weights?: { pillar: (typeof PILLARS)[number]; weight: number }[] }[];
      order?: string[];
      time?: string | null;
    }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { routine, ...edit } = args;
        return ok(await withMode(db, now, { ...(await updateRoutine(db, routine, edit, now)) }));
      } catch (error) {
        return toolError(`update_routine failed: ${(error as Error).message}`);
      }
    },
  );
}
