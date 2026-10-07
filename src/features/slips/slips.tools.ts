import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
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
}
