import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { DEFAULT_CONFIG } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey, localTimeOf } from "@/shared/time";
import { acceptDay, proposeDay } from "./planning.repo";

const tz = DEFAULT_CONFIG.timeZone;
const hhmm = (d: Date) => localTimeOf(d, tz);

export function registerPlanningTools(server: McpServer) {
  server.registerTool(
    "plan_day",
    {
      title: "Plan day",
      description:
        "Propose a schedule for a day (default today): events and timed tasks stay put, meals are reserved, open " +
        "tasks fill the gaps (must-dos first), chores are batched, and the biggest gap after the work is free " +
        "time — rest is part of the game. Present it briefly (a timeline, not a lecture), suggest what to eat from " +
        "get_pantry for the meal slots, and say plainly what didn't fit (`unplaced`, `overCapacity`). It's a " +
        "proposal: nothing changes until accept_day_plan.",
      inputSchema: z.object({ date: z.iso.date().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }: { date?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const plan = await proposeDay(db, date ?? dayKey(now, tz), now);
        return ok(
          await withMode(db, now, {
            date: plan.day,
            timeline: plan.slots.map((s) => ({ from: hhmm(s.start), to: hhmm(s.end), kind: s.kind, title: s.title })),
            assignments: plan.assignments.map((a) => ({ task_id: a.taskId, time: hhmm(a.start), suggestionOnly: a.suggestionOnly })),
            unplaced: plan.unplaced,
            overCapacity: plan.overCapacity,
          }),
        );
      } catch (error) {
        return toolError(`plan_day failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "accept_day_plan",
    {
      title: "Accept day plan",
      description:
        "Set the times from plan_day — as proposed, or with his tweaks. Pass the assignments back (task_id + " +
        "HH:MM). Changed times are re-checked for clashes and capacity. Recurring habits are left as they are " +
        "(result 'habit_not_fixed'): changing a habit's time is a separate, deliberate update_task.",
      inputSchema: z.object({
        date: z.iso.date(),
        assignments: z.array(z.object({ task_id: z.uuid(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).min(1),
      }),
    },
    async ({ date, assignments }: { date: string; assignments: { task_id: string; time: string }[] }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const results = await acceptDay(db, date, assignments.map((a) => ({ taskId: a.task_id, time: a.time })), now);
        return ok(await withMode(db, now, { results }));
      } catch (error) {
        return toolError(`accept_day_plan failed: ${(error as Error).message}`);
      }
    },
  );
}
