import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { logCheckin } from "@/features/metrics/metrics.repo";
import type { Json } from "@/shared/supabase/database.types";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { goEasyOverride, noMercyOverride } from "./mode";
import { withMode } from "./mode.repo";

export function registerModeTools(server: McpServer) {
  server.registerTool(
    "set_mode",
    {
      title: "Set mode",
      description:
        "The user's override always wins. 'no_mercy' = strictest until the user switches it off. 'go_easy' = softest " +
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
        "Record how today is going — any of: energy 1 (empty) to 5 (great), hours slept, mood 1 (awful) to 5 (great), " +
        "screen time (hours or minutes), and a note. Logging again merges: only what's given changes. `date` (YYYY-MM-DD) " +
        "for another day, e.g. last night's sleep logged the next morning goes on the day they woke up (today). Energy " +
        "of 2 or less is a low-HP day: the mode goes soft and recovery steps get smaller. A rough day is not slacking.",
      inputSchema: z.object({
        energy: z.number().int().min(1).max(5).optional(),
        sleep_hours: z.number().min(0).max(24).optional(),
        mood: z.number().int().min(1).max(5).optional(),
        screen_time_hours: z.number().min(0).max(24).optional(),
        screen_time_minutes: z.number().int().min(0).max(1440).optional(),
        note: z.string().max(1000).optional(),
        date: z.iso.date().optional(),
      }),
    },
    async (
      args: { energy?: number; sleep_hours?: number; mood?: number; screen_time_hours?: number; screen_time_minutes?: number; note?: string; date?: string },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const screen = args.screen_time_minutes ?? (args.screen_time_hours !== undefined ? Math.round(args.screen_time_hours * 60) : undefined);
        const saved = await logCheckin(
          db,
          { date: args.date, energy: args.energy, sleepHours: args.sleep_hours !== undefined ? Math.round(args.sleep_hours * 10) / 10 : undefined, mood: args.mood, screenMinutes: screen, note: args.note },
          now,
        );
        if (saved.result === "nothing_to_log") return toolError("log_checkin needs at least one of energy, sleep_hours, mood, screen time or note.");
        return ok(await withMode(db, now, { ...saved }));
      } catch (error) {
        return toolError(`log_checkin failed: ${(error as Error).message}`);
      }
    },
  );
}
