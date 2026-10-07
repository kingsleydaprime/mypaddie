import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { loadValues, setValues } from "./values.repo";

export function registerValuesTools(server: McpServer) {
  server.registerTool(
    "set_values",
    {
      title: "Set values",
      description:
        "Their core values, most important first — the whole list, replacing what's there (get_today has the current " +
        "one). A few words each, with an optional why. Help them name values in their own words; don't suggest ones " +
        "they'd have to adopt. Use them quietly: when a decision, purchase or new commitment clearly pulls against one, " +
        "name it once — never moralise or bring them up when nothing's at stake.",
      inputSchema: z.object({
        values: z.array(z.object({ value: z.string().trim().min(1).max(120), why: z.string().trim().max(500).optional() })).max(15),
      }),
    },
    async ({ values }: { values: { value: string; why?: string }[] }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const saved = await setValues(db, values);
        return ok(await withMode(db, now, { ...saved, values: await loadValues(db) }));
      } catch (error) {
        return toolError(`set_values failed: ${(error as Error).message}`);
      }
    },
  );
}
