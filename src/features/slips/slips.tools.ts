import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadMode, withMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { judgeSlip, type SlipReason } from "./slips";

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
        "slips protect a need from the ignored-need XP deduction.",
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
        const config = currentConfig();

        const { data: task, error: taskError } = await db.from("tasks").select("id, title, item_id").eq("id", args.task_id).maybeSingle();
        if (taskError) return toolError(`log_slip failed: ${taskError.message}`);
        if (!task) return toolError("log_slip failed: no such task");
        const key = task.item_id ?? task.id;

        // Earlier slips on the same habit inside the window, with their reasons.
        const since = new Date(now.getTime() - (config.slips.excuseWindowDays + 1) * 86_400_000).toISOString();
        let previousQuery = db.from("slips").select("task_id, why, why_category, at, tasks!inner(item_id)").gte("at", since);
        previousQuery = task.item_id ? previousQuery.eq("tasks.item_id", task.item_id) : previousQuery.eq("task_id", task.id);
        const { data: previousRows, error: prevError } = await previousQuery;
        if (prevError) return toolError(`log_slip failed: ${prevError.message}`);

        const previous: SlipReason[] = previousRows.map((r) => ({ key, why: r.why ?? "", category: r.why_category, at: new Date(r.at) }));
        const verdict = judgeSlip({ key, why: args.why, category: args.why_category, at: now }, args.paddie_accepts, previous, config);

        const toneBefore = await loadMode(db, now);
        const { error } = await db.rpc("record_slip", {
          p_task_id: task.id,
          p_why: args.why,
          p_why_category: args.why_category,
          p_accepted: verdict.accepted,
          p_tone: toneBefore.mode,
        });
        if (error) return toolError(`log_slip failed: ${error.message}`);

        return ok(
          await withMode(db, now, {
            task: task.title,
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
