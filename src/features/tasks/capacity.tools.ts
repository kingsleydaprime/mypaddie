import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey } from "@/shared/time";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { roomOn } from "./capacity";
import { loadCapacity, loadDayTasks, saveCapacity } from "./tasks.repo";

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

export function registerCapacityTools(server: McpServer) {
  server.registerTool(
    "get_capacity",
    {
      title: "Get capacity",
      description:
        "His daily capacity (hours of tasks a day), any date-range overrides, and how full a given day is " +
        "(default today). Use when he asks how much is on his plate.",
      inputSchema: z.object({ date: z.iso.date().optional().describe("YYYY-MM-DD, Lagos. Default today") }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }: { date?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const day = date ?? dayKey(now, currentConfig().timeZone);
        const [setting, tasks, schedule] = await Promise.all([loadCapacity(db), loadDayTasks(db, day), loadSchedule(db)]);
        const room = roomOn(day, tasks, setting, now, undefined, dayEndsAt(schedule));
        return ok(
          await withMode(db, now, {
            defaultHours: hours(setting.defaultMinutes),
            periods: setting.periods.map((p) => ({ ...p, hours: hours(p.minutes) })),
            day: { date: day, label: room.label, capacityHours: hours(room.capacity), committedHours: hours(room.committed), availableHours: hours(room.available) },
          }),
        );
      } catch (error) {
        return toolError(`get_capacity failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "set_capacity",
    {
      title: "Set capacity",
      description:
        "Change how many hours of tasks fit in a day — only when Kingsley asks to. Without dates, sets the default. " +
        "With from/to, adds a period that overrides the default on those dates (e.g. exams: 2 hours a day), and " +
        "replaces any existing period with the same label. remove_label deletes a period.",
      inputSchema: z.object({
        hours: z.number().min(0).max(18).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        label: z.string().trim().min(1).max(40).optional(),
        remove_label: z.string().trim().min(1).optional(),
      }),
    },
    async (args: { hours?: number; from?: string; to?: string; label?: string; remove_label?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const setting = await loadCapacity(db);
        if (args.remove_label) {
          setting.periods = setting.periods.filter((p) => p.label !== args.remove_label);
        } else if (args.hours === undefined) {
          return toolError("set_capacity: give hours (and from/to for a period), or remove_label");
        } else if (args.from || args.to) {
          if (!args.from || !args.to || args.from > args.to) return toolError("set_capacity: a period needs from ≤ to");
          const label = args.label ?? `${args.from} to ${args.to}`;
          setting.periods = [...setting.periods.filter((p) => p.label !== label), { from: args.from, to: args.to, minutes: Math.round(args.hours * 60), label }];
        } else {
          setting.defaultMinutes = Math.round(args.hours * 60);
        }
        await saveCapacity(db, setting);
        return ok(await withMode(db, new Date(), { defaultHours: hours(setting.defaultMinutes), periods: setting.periods.map((p) => ({ ...p, hours: hours(p.minutes) })) }));
      } catch (error) {
        return toolError(`set_capacity failed: ${(error as Error).message}`);
      }
    },
  );
}
