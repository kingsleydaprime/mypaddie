import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { mealSchema, type ScheduleChange } from "./schedule";
import { loadSchedule, updateSchedule } from "./settings.repo";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function registerSettingsTools(server: McpServer) {
  server.registerTool(
    "get_settings",
    {
      title: "Get settings",
      description: "His schedule settings: quiet hours, morning brief time, evening/morning reminder times, how many days count as 'close' for events, meal times, and the fun nudge (after how many days without fun, and when).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await loadSchedule(db)) }));
      } catch (error) {
        return toolError(`get_settings failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_settings",
    {
      title: "Update settings",
      description:
        "Change schedule settings — only what he asks to change. Quiet hours may cross midnight (23:00 → 06:30); " +
        "no nudges arrive inside them. A reminder time inside quiet hours is refused (it would never arrive): " +
        "explain and suggest a time just outside. `meals` replaces the whole list.",
      inputSchema: z.object({
        quiet_start: time.optional(),
        quiet_end: time.optional(),
        brief_at: time.optional(),
        evening_at: time.optional().describe("Evening-before reminders"),
        morning_at: time.optional().describe("Morning-of reminders"),
        event_close_days: z.number().int().min(1).max(60).optional(),
        meals: z.array(mealSchema).max(6).optional(),
        fun_every_days: z.number().int().min(0).max(60).optional().describe("Nudge after this many days without fun; 0 = off"),
        fun_at: time.optional().describe("When the fun nudge arrives"),
      }),
    },
    async (
      args: { quiet_start?: string; quiet_end?: string; brief_at?: string; evening_at?: string; morning_at?: string; event_close_days?: number; meals?: z.infer<typeof mealSchema>[]; fun_every_days?: number; fun_at?: string },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const change: ScheduleChange = {
          ...(args.quiet_start ? { quietStart: args.quiet_start } : {}),
          ...(args.quiet_end ? { quietEnd: args.quiet_end } : {}),
          ...(args.brief_at ? { briefAt: args.brief_at } : {}),
          ...(args.evening_at ? { eveningAt: args.evening_at } : {}),
          ...(args.morning_at ? { morningAt: args.morning_at } : {}),
          ...(args.event_close_days ? { eventCloseDays: args.event_close_days } : {}),
          ...(args.meals ? { meals: args.meals } : {}),
          ...(args.fun_every_days !== undefined ? { funEveryDays: args.fun_every_days } : {}),
          ...(args.fun_at ? { funAt: args.fun_at } : {}),
        };
        const result = await updateSchedule(db, change);
        if (!result.ok) return toolError(`update_settings: ${result.error}`);
        return ok(await withMode(db, new Date(), { ...result.schedule }));
      } catch (error) {
        return toolError(`update_settings failed: ${(error as Error).message}`);
      }
    },
  );
}
