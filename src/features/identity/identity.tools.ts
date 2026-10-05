import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";

export function registerIdentityTools(server: McpServer) {
  server.registerTool(
    "get_identity",
    {
      title: "Get identity",
      description:
        "The active 'Who I'm becoming' profile, plus the list of saved versions. Coach toward the active one: " +
        "praise choices that fit it, push back on ones that don't, and never debate whether it's the right one.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { data, error } = await db.from("identity_profiles").select("id, name, text, is_active, created_at").order("created_at", { ascending: false });
        if (error) return toolError(`get_identity failed: ${error.message}`);
        const active = data.find((p) => p.is_active) ?? null;
        return ok(
          await withMode(db, new Date(), {
            active,
            versions: data.map(({ id, name, is_active }) => ({ id, name, is_active })),
            ...(active ? {} : { hint: "No active profile yet. Offer to help him write one." }),
          }),
        );
      } catch (error) {
        return toolError(`get_identity failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "save_identity",
    {
      title: "Save identity",
      description:
        "Save a new version of the 'Who I'm becoming' profile in his words (e.g. 'this month I'm working on…'). " +
        "Versions are kept; activate=true makes this the one coached toward.",
      inputSchema: z.object({ name: z.string().trim().min(1), text: z.string().trim().min(1), activate: z.boolean().default(true) }),
    },
    async (args: { name: string; text: string; activate: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { data: id, error } = await db.rpc("save_identity", { p_name: args.name, p_text: args.text, p_activate: args.activate });
        if (error) return toolError(`save_identity failed: ${error.message}`);
        return ok(await withMode(db, new Date(), { id, name: args.name, active: args.activate }));
      } catch (error) {
        return toolError(`save_identity failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "activate_identity",
    {
      title: "Activate identity",
      description: "Switch which saved 'Who I'm becoming' version is active.",
      inputSchema: z.object({ id: z.uuid() }),
    },
    async ({ id }: { id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { data: found, error } = await db.rpc("activate_identity", { p_id: id });
        if (error) return toolError(`activate_identity failed: ${error.message}`);
        if (!found) return toolError("activate_identity: no such profile");
        return ok(await withMode(db, new Date(), { activated: id }));
      } catch (error) {
        return toolError(`activate_identity failed: ${(error as Error).message}`);
      }
    },
  );
}
