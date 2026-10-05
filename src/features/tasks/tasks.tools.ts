import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { completeTask } from "./tasks.repo";

export function registerTaskTools(server: McpServer) {
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
        const outcome = await completeTask(db, task_id, now);
        const mode = await loadMode(db, now);
        return ok({ ...outcome, mode });
      } catch (error) {
        return toolError(`complete_task failed: ${(error as Error).message}`);
      }
    },
  );
}
