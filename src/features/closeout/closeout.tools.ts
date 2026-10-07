import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { siteOrigin } from "@/shared/site";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { closeOut, loadCloseOut, type CloseDecision } from "./closeout.repo";

const decision = z.discriminatedUnion("kind", [
  z.object({ task_id: z.uuid(), kind: z.literal("move"), to: z.iso.date().describe("YYYY-MM-DD, after today") }),
  z.object({ task_id: z.uuid(), kind: z.literal("drop") }),
  z.object({
    task_id: z.uuid(),
    kind: z.literal("slipped"),
    why: z.string().trim().min(1).describe("Their reason, in their words"),
    category: z.string().trim().min(1).max(40).describe("Short: tired, forgot, sick, no time…"),
    paddie_accepts: z.boolean().describe("Your judgement, as in log_slip: a real reason, or an excuse"),
  }),
]);
type DecisionArg = z.infer<typeof decision>;

export function registerCloseOutTools(server: McpServer) {
  server.registerTool(
    "close_day",
    {
      title: "Close out the day",
      description:
        "The evening wrap-up, in two steps. 1) Call with nothing: you get what got done, what's still open (each with " +
        "the options it allows), tomorrow (tasks, events, bills, free time) and any check-in fields not logged. Open " +
        "with one line on the day, then go through the open ones quickly: move (to a date), drop, or slipped (ask why " +
        "in one line and judge it, as in log_slip). A need can't be dropped and a habit's missed day can't be moved " +
        "(tomorrow has its own) — those only slip. If `carriedOver` lists something, push to shrink it to a first step " +
        "or drop it instead of moving it again. Ask for one win. 2) Call with `decisions` (and `win`/`note`), or " +
        "`finish: true` when nothing's open, to apply them and close the day (+5 XP once a day for the habit, " +
        "whatever the day was like). Then preview tomorrow in two lines. Missing mood/sleep: ask, then log_checkin.",
      inputSchema: z.object({
        decisions: z.array(decision).max(50).optional(),
        win: z.string().trim().max(500).optional().describe("One thing that went well, in their words"),
        note: z.string().trim().max(1000).optional(),
        finish: z.boolean().optional().describe("Close the day even with no decisions"),
      }),
    },
    async (args: { decisions?: DecisionArg[]; win?: string; note?: string; finish?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        if (!args.decisions?.length && !args.finish && !args.win) return ok(await withMode(db, now, await loadCloseOut(db, now)));
        const decisions: CloseDecision[] = (args.decisions ?? []).map((d) =>
          d.kind === "move"
            ? { taskId: d.task_id, kind: "move", to: d.to }
            : d.kind === "drop"
              ? { taskId: d.task_id, kind: "drop" }
              : { taskId: d.task_id, kind: "slipped", why: d.why, category: d.category, accepts: d.paddie_accepts },
        );
        const result = await closeOut(db, { decisions, win: args.win, note: args.note }, now);
        const after = await loadCloseOut(db, now);
        return ok(await withMode(db, now, { ...result, stillOpen: after.unfinished, tomorrow: after.tomorrow }));
      } catch (error) {
        return toolError(`close_day failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "export_data",
    {
      title: "Export my data",
      description:
        "A backup of everything they've put in MyPaddie. Gives the download link for the full JSON file (they open it " +
        "signed in; it isn't sent through chat) and how many records each part holds. With `table`, returns that " +
        "part's rows (up to 500) so you can look something up or hand it over.",
      inputSchema: z.object({ table: z.string().trim().min(1).max(60).optional() }),
      annotations: { readOnlyHint: true },
    },
    async (args: { table?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { data, error } = await db.rpc("export_all");
        if (error) return toolError(`export_data failed: ${error.message}`);
        const all = data as Record<string, unknown>;
        const tables = Object.fromEntries(
          Object.entries(all).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]),
        );
        let origin = "";
        try {
          origin = await siteOrigin();
        } catch {
          // Outside a request (tests): a relative link still tells them where to go.
        }
        if (args.table) {
          const rows = all[args.table];
          if (!Array.isArray(rows)) return toolError(`export_data: no part called "${args.table}". Parts: ${Object.keys(tables).join(", ")}`);
          return ok(await withMode(db, now, { table: args.table, total: rows.length, rows: rows.slice(0, 500), truncated: rows.length > 500 }));
        }
        return ok(
          await withMode(db, now, {
            download: `${origin}/app/export`,
            exportedAt: all.exported_at,
            tables,
            records: Object.values(tables).reduce((s, n) => s + n, 0),
          }),
        );
      } catch (error) {
        return toolError(`export_data failed: ${(error as Error).message}`);
      }
    },
  );
}
