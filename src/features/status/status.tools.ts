import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { STATUS_KINDS } from "./status";
import { clearStatus, setStatus, untilFrom } from "./status.repo";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function registerStatusTools(server: McpServer) {
  server.registerTool(
    "set_status",
    {
      title: "Set where I am",
      description:
        "Where they are right now, until a time (`until` HH:MM — tomorrow if already past — or `minutes`; at most 16h). " +
        "It decides what Paddie sends meanwhile: sleeping, in_class, worship and deep_work hold everything (it arrives " +
        "after); with_friends, out, at_work, commuting and resting let only what's coming up through; with_friends, out " +
        "and at_work also get 'time to head out' before the next timed thing (`leave_lead_minutes`, default 30). Classes " +
        "from their timetable set in_class by themselves. Set it when they mention where they are (\"I'm with the guys " +
        "till 9\"), confirm in a line, and don't pester them while it lasts.",
      inputSchema: z.object({
        kind: z.enum(STATUS_KINDS),
        until: time.optional(),
        minutes: z.number().int().min(5).max(960).optional(),
        note: z.string().max(200).optional(),
        leave_lead_minutes: z.number().int().min(5).max(180).optional(),
      }),
    },
    async (a: { kind: (typeof STATUS_KINDS)[number]; until?: string; minutes?: number; note?: string; leave_lead_minutes?: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const until = untilFrom(a, now);
        if (!until) return toolError("set_status: give `until` (HH:MM) or `minutes`");
        return ok(await withMode(db, now, { ...(await setStatus(db, { kind: a.kind, until, note: a.note, leaveLeadMinutes: a.leave_lead_minutes }, now)) }));
      } catch (error) {
        return toolError(`set_status failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "clear_status",
    {
      title: "Clear where I am",
      description: "They're back (home early, class over): the status they set ends now. A running class or phone-free window still applies.",
      inputSchema: z.object({}),
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await clearStatus(db, now)) }));
      } catch (error) {
        return toolError(`clear_status failed: ${(error as Error).message}`);
      }
    },
  );
}
