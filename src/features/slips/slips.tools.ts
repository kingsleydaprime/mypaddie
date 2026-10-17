import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { markTaskMissed } from "@/features/tasks/tasks.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { recordSlip } from "./slips.repo";

export function registerSlipTools(server: McpServer) {
  server.registerTool(
    "log_slip",
    {
      title: "Log slip",
      description:
        "Record that a task was skipped and why. Follow the slip protocol: name it plainly, ask why in one line, " +
        "then ask for the smallest next action (doing it late still earns XP). Give your judgement in " +
        "paddie_accepts: a real reason (sick, emergency, power cut) is accepted; an excuse used to skip the next " +
        "step is not. Also give a short why_category (e.g. 'tired', 'late night', 'forgot') so repeats are caught: " +
        "the same reason for the same habit 3 times in a week is treated as an excuse regardless. Only accepted " +
        "slips protect a need from the ignored-need XP deduction. Logged against the wrong task, or they did it after " +
          "all? undo with kind 'slip'.",
      inputSchema: z.object({
        task_id: z.uuid(),
        why: z.string().trim().min(1).describe("Their reason, in their words"),
        why_category: z.string().trim().min(1).max(40),
        paddie_accepts: z.boolean(),
      }),
    },
    async (args: { task_id: string; why: string; why_category: string; paddie_accepts: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const res = await recordSlip(db, { taskId: args.task_id, why: args.why, category: args.why_category, accepts: args.paddie_accepts }, now);
        if (res.result === "not_found") return toolError("log_slip failed: no such task");
        const { task, verdict } = res;

        return ok(
          await withMode(db, now, {
            task,
            verdict,
            protectsFromDeduction: verdict.accepted,
            next: "Ask for the smallest next action. Doing it late still earns XP.",
          }),
        );
      } catch (error) {
        return toolError(`log_slip failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "mark_task_missed",
    {
      title: "Mark a task as missed",
      description:
        "Self-report that a task or habit was missed. This is different from log_slip: it is a deliberate, honest " +
        "self-report and should include a brief why. The rule is: the miss penalty is harsher than a normal completion, " +
        "and the honesty bonus is smaller than the penalty, so a miss never pays a net gain if they report it honestly. " +
        "The bonus only applies when they report it themselves. `self_reported` should usually be true unless the app " +
        "already caught it first. For a routine step, use that step's task_id from get_today.routine.items or " +
        "list_routines.step_refs.today; this marks only that occurrence missed, not the whole routine.",
      inputSchema: z.object({
        task_id: z.uuid(),
        reason: z.string().trim().min(1).max(300).describe("Why it was missed, as a short honest note"),
        self_reported: z.boolean().default(true),
      }),
    },
    async ({ task_id, reason, self_reported }: { task_id: string; reason: string; self_reported: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const outcome = await markTaskMissed(db, task_id, reason, self_reported, now);

        if (outcome.result !== "recorded") {
          return toolError(`mark_task_missed failed: ${outcome.result.replace("_", " ")}`);
        }

        return ok(
          await withMode(db, now, {
            task_id,
            title: outcome.title,
            reason,
            self_reported,
            penalty: outcome.penalty,
            honesty: outcome.honesty,
            result: outcome.result,
            next: "It is now marked missed and the penalty/honesty XP has been applied.",
          }),
        );
      } catch (error) {
        return toolError(`mark_task_missed failed: ${(error as Error).message}`);
      }
    },
  );
}
