import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { loadTraining, logWorkout, savePlan, workoutFor } from "./workouts.repo";

const weekday = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
const exercise = z.object({
  name: z.string().trim().min(1),
  sets: z.number().int().min(1).max(50).optional(),
  reps: z.string().trim().min(1).optional().describe("'8', '8-12', 'AMRAP'"),
  weight_kg: z.number().nonnegative().optional(),
  seconds: z.number().int().positive().optional().describe("For holds like planks"),
  notes: z.string().optional(),
});
const performed = z.object({
  exercise: z.string().trim().min(1),
  sets: z.number().int().min(1).max(50).optional(),
  reps: z.number().int().min(1).max(1000).optional(),
  weight_kg: z.number().nonnegative().optional(),
  seconds: z.number().int().positive().optional(),
});

export function registerWorkoutTools(server: McpServer) {
  server.registerTool(
    "set_workout_plan",
    {
      title: "Set workout plan",
      description:
        "Save a training plan: days (e.g. Push on MO,TH at 18:00 for 60 min) and each day's exercises. With " +
        "activate (default), it replaces the current plan: the old plan's training tasks stop and each new day " +
        "becomes a weekly recurring task — so it shows on Today, gets reminders, and counts against capacity. " +
        "Days that clash or don't fit come back in `schedule`; tell him which and offer another time.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        days: z
          .array(
            z.object({
              name: z.string().trim().min(1),
              weekdays: z.array(weekday).min(1),
              start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
              duration_minutes: z.number().int().min(5).max(300).default(60),
              exercises: z.array(exercise).default([]),
            }),
          )
          .min(1),
        activate: z.boolean().default(true),
        non_negotiable: z.boolean().default(true).describe("Training days get escalating nudges until done"),
      }),
    },
    async (
      args: {
        name: string;
        days: { name: string; weekdays: z.infer<typeof weekday>[]; start_time?: string; duration_minutes: number; exercises: z.infer<typeof exercise>[] }[];
        activate: boolean;
        non_negotiable: boolean;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const saved = await savePlan(
          db,
          args.name,
          args.days.map((d) => ({
            name: d.name,
            weekdays: d.weekdays,
            startTime: d.start_time ?? null,
            durationMinutes: d.duration_minutes,
            exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, weightKg: e.weight_kg, seconds: e.seconds, notes: e.notes })),
          })),
          { activate: args.activate, nonNegotiable: args.non_negotiable },
          now,
        );
        return ok(await withMode(db, now, { ...saved }));
      } catch (error) {
        return toolError(`set_workout_plan failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description:
        "The workout planned for a day (default today): each exercise with its target, plus what he did last time " +
        "(`lastTime`) so he knows what to beat. Nudge for a small progression — one more rep or a bit more weight.",
      inputSchema: z.object({ date: z.iso.date().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }: { date?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await workoutFor(db, now, date)) }));
      } catch (error) {
        return toolError(`get_workout failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "log_workout",
    {
      title: "Log workout",
      description:
        "Record a finished workout with what was actually done. Completes today's training task (that pays the " +
        "XP); an unplanned workout is recorded as a one-off. If `newBests` isn't empty, celebrate it specifically " +
        "('bench up from 42.5 to 45kg') — that's earned praise.",
      inputSchema: z.object({
        day: z.string().trim().min(1).optional().describe("Training day name; default today's"),
        duration_minutes: z.number().int().min(1).max(600),
        feel: z.number().int().min(1).max(5).optional().describe("1 awful – 5 great"),
        notes: z.string().optional(),
        entries: z.array(performed).default([]),
      }),
    },
    async (
      args: { day?: string; duration_minutes: number; feel?: number; notes?: string; entries: z.infer<typeof performed>[] },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const logged = await logWorkout(
          db,
          {
            day: args.day,
            durationMinutes: args.duration_minutes,
            feel: args.feel,
            notes: args.notes,
            entries: args.entries.map((e) => ({ exercise: e.exercise, sets: e.sets ?? null, reps: e.reps ?? null, weightKg: e.weight_kg ?? null, seconds: e.seconds ?? null })),
          },
          now,
        );
        return ok(await withMode(db, now, { ...logged }));
      } catch (error) {
        return toolError(`log_workout failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_training",
    {
      title: "Get training",
      description: "Training progress: workouts in the last 7 and 30 days, the last workout, and the best ever for each exercise.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await loadTraining(db, now)) }));
      } catch (error) {
        return toolError(`get_training failed: ${(error as Error).message}`);
      }
    },
  );
}
