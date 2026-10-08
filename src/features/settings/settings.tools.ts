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
      description: "Their schedule settings: quiet hours, morning brief time, evening/morning reminder times, how many days count as 'close' for events, meal times, and the fun nudge (after how many days without fun, and when).",
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
        "Change schedule settings — only what the user asks to change. Quiet hours may cross midnight (23:00 → 06:30); " +
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
        close_out: z.boolean().optional().describe("The evening close-out push on or off"),
        close_at: time.optional().describe("When the close-out push arrives (if the day isn't closed)"),
        any_time_nudge_from: time.optional().describe("When a must-do with no set time starts escalating that day (default 15:00)"),
        show_timed_within: z.number().int().min(0).max(720).optional().describe("Minutes before its time a timed task (an evening routine, a 17:00 call) moves up into 'now' on Today and the morning brief; until then it waits below what can be done now. Default 60"),
        week_start: z.enum(["sunday", "monday"]).optional().describe("Their week: sunday = Sunday–Saturday, monday = Monday–Sunday. Weekly reviews, trends and 'this week' follow it"),
        phone_free_morning: z.number().int().min(0).max(240).optional().describe("Minutes after quiet hours end with no phone (and no pushes); 0 = off"),
        phone_free_evening: z.number().int().min(0).max(240).optional().describe("Minutes before quiet hours start with no phone; 0 = off"),
      }),
    },
    async (
      args: { quiet_start?: string; quiet_end?: string; brief_at?: string; evening_at?: string; morning_at?: string; event_close_days?: number; meals?: z.infer<typeof mealSchema>[]; fun_every_days?: number; fun_at?: string; close_out?: boolean; close_at?: string; any_time_nudge_from?: string; week_start?: "sunday" | "monday"; show_timed_within?: number; phone_free_morning?: number; phone_free_evening?: number },
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
          ...(args.close_out !== undefined ? { closeOut: args.close_out } : {}),
          ...(args.close_at ? { closeAt: args.close_at } : {}),
          ...(args.any_time_nudge_from ? { anyTimeNudgeFrom: args.any_time_nudge_from } : {}),
          ...(args.week_start ? { weekStart: args.week_start } : {}),
          ...(args.show_timed_within !== undefined ? { showTimedWithin: args.show_timed_within } : {}),
          ...(args.phone_free_morning !== undefined ? { phoneFreeMorning: args.phone_free_morning } : {}),
          ...(args.phone_free_evening !== undefined ? { phoneFreeEvening: args.phone_free_evening } : {}),
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
