import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONFIG } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey } from "@/shared/time";
import { goEasyOverride, noMercyOverride } from "./mode";
import { withMode } from "./mode.repo";

export function registerModeTools(server: McpServer) {
  server.registerTool(
    "set_mode",
    {
      title: "Set mode",
      description:
        "Kingsley's override always wins. 'no_mercy' = strictest until he switches it off. 'go_easy' = softest " +
        "for the rest of today. 'normal' = clear any override and let the data decide.",
      inputSchema: z.object({ mode: z.enum(["no_mercy", "go_easy", "normal"]) }),
    },
    async ({ mode }: { mode: "no_mercy" | "go_easy" | "normal" }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        if (mode === "normal") {
          const { error } = await db.from("settings").delete().eq("key", "mode_override");
          if (error) return toolError(`set_mode failed: ${error.message}`);
        } else {
          const override = mode === "no_mercy" ? noMercyOverride() : goEasyOverride(now);
          const value: { [key: string]: Json } = { mode: override.mode, expiresAt: override.expiresAt?.toISOString() ?? null };
          const { error } = await db.from("settings").upsert({ key: "mode_override", value }, { onConflict: "user_id,key" });
          if (error) return toolError(`set_mode failed: ${error.message}`);
        }
        return ok(await withMode(db, now, { set: mode }));
      } catch (error) {
        return toolError(`set_mode failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "log_checkin",
    {
      title: "Log check-in",
      description:
        "Record today's energy from 1 (empty) to 5 (great), with an optional note. Energy of 2 or less is a " +
        "low-HP day: the mode goes soft and recovery steps get smaller. A rough day is not slacking. " +
        "Logging again today replaces the earlier entry.",
      inputSchema: z.object({ energy: z.number().int().min(1).max(5), note: z.string().optional() }),
    },
    async ({ energy, note }: { energy: number; note?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const day = dayKey(now, DEFAULT_CONFIG.timeZone);
        const { error } = await db.from("checkins").upsert({ day, energy, note: note ?? null }, { onConflict: "user_id,day" });
        if (error) return toolError(`log_checkin failed: ${error.message}`);
        return ok(await withMode(db, now, { day, energy }));
      } catch (error) {
        return toolError(`log_checkin failed: ${(error as Error).message}`);
      }
    },
  );
}
