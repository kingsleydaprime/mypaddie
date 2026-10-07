import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { recentUndoable, undo } from "./undo.repo";

const KINDS = ["task", "fun", "workout", "learning"] as const;

export function registerUndoTools(server: McpServer) {
  server.registerTool(
    "undo",
    {
      title: "Undo a mistake",
      description:
        "Undo a mis-tapped or wrong complete_task, log_fun, log_workout or log_learning. Without `id` it changes nothing " +
        "and lists what was done in the last 48 hours (optionally only one `kind`): confirm the right one with the user " +
        "by name, then call again with its `kind` and `id`. The XP is taken back (the ledger keeps both the original and " +
        "the reversal), and what it set off is rolled back: the workout log, the fun count, a kept promise, an application " +
        "requirement, practice time. A planned task goes back to pending; something logged after the fact is cancelled. " +
        "Not for a real slip — that's log_slip — and never to dodge a penalty: deductions can't be undone.",
      inputSchema: z.object({
        kind: z.enum(KINDS).optional(),
        id: z.uuid().optional().describe("From the list this tool returns without an id"),
      }),
    },
    async (args: { kind?: (typeof KINDS)[number]; id?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        if (!args.id) return ok(await withMode(db, now, { recent: await recentUndoable(db, now, args.kind), note: "Nothing changed yet." }));
        if (!args.kind) return toolError("undo needs `kind` with `id` (both come from the list).");
        return ok(await withMode(db, now, { ...(await undo(db, args.kind, args.id)) }));
      } catch (error) {
        return toolError(`undo failed: ${(error as Error).message}`);
      }
    },
  );
}
