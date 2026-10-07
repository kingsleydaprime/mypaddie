import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { calendarStatus, connectCalendar, disconnectCalendar, syncCalendar } from "./calendar.repo";

export function registerCalendarTools(server: McpServer) {
  server.registerTool(
    "connect_calendar",
    {
      title: "Connect calendar",
      description:
        "Import their Google Calendar (read-only). The user needs the 'Secret address in iCal format': Google Calendar → " +
        "Settings → their calendar → Integrate calendar. Treat that link like a password: don't repeat it back. " +
        "Imported events count for clashes, capacity, reminders and plan_day, and re-sync automatically.",
      inputSchema: z.object({ url: z.url() }),
    },
    async ({ url }: { url: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await connectCalendar(db, url, now)), status: await calendarStatus(db) }));
      } catch (error) {
        return toolError(`connect_calendar failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "sync_calendar",
    {
      title: "Sync calendar",
      description: "Pull the latest from their Google Calendar now (it also syncs by itself every 30 minutes when the user opens the app).",
      inputSchema: z.object({}),
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await syncCalendar(db, now, { force: true })), status: await calendarStatus(db) }));
      } catch (error) {
        return toolError(`sync_calendar failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "disconnect_calendar",
    {
      title: "Disconnect calendar",
      description: "Stop importing their Google Calendar and remove the imported events (their own MyPaddie events stay).",
      inputSchema: z.object({}),
      annotations: { destructiveHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await disconnectCalendar(db)) }));
      } catch (error) {
        return toolError(`disconnect_calendar failed: ${(error as Error).message}`);
      }
    },
  );
}
