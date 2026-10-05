import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { loadSchedule } from "@/features/settings/settings.repo";
import { createTask, loadDayTasks } from "@/features/tasks/tasks.repo";
import { findClashes } from "@/features/tasks/capacity";
import { DEFAULT_CONFIG } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addDays, dayKey, formatLocal, zonedInstant } from "@/shared/time";
import { EVENT_KINDS, upcoming, type EventKind } from "./events";
import { changeEvent, insertEvent, loadUpcomingEvents } from "./events.repo";

const tz = DEFAULT_CONFIG.timeZone;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const fields = {
  title: z.string().trim().min(1),
  kind: z.enum(EVENT_KINDS),
  date: z.iso.date().describe("YYYY-MM-DD (for birthdays/anniversaries: any year it happened, with yearly=true)"),
  start_time: time.optional().describe("HH:MM Lagos; omit for an all-day event"),
  end_time: time.optional(),
  important: z.boolean(),
  yearly: z.boolean().optional().describe("Default true for birthdays and anniversaries"),
  person: z.string().trim().optional(),
  location: z.string().trim().optional(),
  notes: z.string().optional(),
};

export function registerEventTools(server: McpServer) {
  server.registerTool(
    "add_event",
    {
      title: "Add event",
      description:
        "Something to attend or remember — a meeting, party, birthday, anniversary, wedding, appointment. (Things " +
        "to *do* are tasks.) Ask whether it's important if unclear: important ones are reminded a week ahead and " +
        "the morning of; all are reminded the evening before and 30 min before. Birthdays/anniversaries repeat " +
        "yearly. For important events that need preparation (a gift, an outfit, travel), pass prep to create a " +
        "prep task ahead of it. If `clashes` comes back non-empty, tell him what overlaps.",
      inputSchema: z.object({
        ...fields,
        prep: z
          .object({ days_before: z.number().int().min(1).max(90), title: z.string().trim().min(1).optional(), duration_minutes: z.number().int().min(5).max(600).optional() })
          .optional(),
      }),
    },
    async (
      args: {
        title: string; kind: EventKind; date: string; start_time?: string; end_time?: string; important: boolean; yearly?: boolean;
        person?: string; location?: string; notes?: string; prep?: { days_before: number; title?: string; duration_minutes?: number };
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const allDay = !args.start_time;
        const startsAt = zonedInstant(args.date, args.start_time ?? "00:00", tz);
        const endsAt = args.start_time && args.end_time ? zonedInstant(args.date, args.end_time, tz) : null;
        if (endsAt && endsAt <= startsAt) return toolError("add_event: the end must be after the start");
        const yearly = args.yearly ?? (args.kind === "birthday" || args.kind === "anniversary");

        const event = await insertEvent(db, {
          title: args.title, kind: args.kind, startsAt, endsAt, allDay, important: args.important, yearly,
          person: args.person, location: args.location, notes: args.notes,
        });

        // Informational: events aren't refused for clashing — you go to the wedding.
        const day = dayKey(upcoming([event], now, 3660)[0]?.at ?? startsAt, tz);
        const clashes = allDay
          ? []
          : findClashes(startsAt, endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : 60, await loadDayTasks(db, day), `event:${event.id}`)
              .map((c) => ({ title: c.title, at: formatLocal(c.start, tz) }));

        let prep = null;
        if (args.prep) {
          const prepDay = addDays(day, -args.prep.days_before);
          prep = await createTask(
            db,
            {
              title: args.prep.title ?? `Prep: ${args.title}`,
              itemId: null,
              baseXp: 10,
              dueDate: prepDay < dayKey(now, tz) ? dayKey(now, tz) : prepDay,
              dueTime: null,
              recurrence: null,
              nonNegotiable: false,
              weights: [{ pillar: "relationships", weight: 50 }, { pillar: "character", weight: 50 }],
              durationMinutes: args.prep.duration_minutes ?? 60,
              mustFrom: zonedInstant(prepDay < dayKey(now, tz) ? dayKey(now, tz) : prepDay, "09:00", tz),
            },
            now,
          );
        }
        const view = upcoming([event], now, 3660)[0];
        return ok(await withMode(db, now, { event: { id: event.id, title: event.title, quadrant: view?.quadrant, daysAway: view?.daysAway, yearly }, clashes, prep }));
      } catch (error) {
        return toolError(`add_event failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update event",
      description: "Edit an event, mark it done, cancel it, or delete one added by mistake. Use ids from list_events.",
      inputSchema: z.object({
        id: z.uuid(),
        action: z.enum(["edit", "cancel", "done", "delete"]).default("edit"),
        title: fields.title.optional(),
        kind: fields.kind.optional(),
        date: fields.date.optional(),
        start_time: time.nullable().optional().describe("null = make it all-day"),
        end_time: time.nullable().optional(),
        important: z.boolean().optional(),
        yearly: z.boolean().optional(),
        person: z.string().trim().optional(),
        location: z.string().trim().optional(),
        notes: z.string().optional(),
      }),
    },
    async (
      args: {
        id: string; action: "edit" | "cancel" | "done" | "delete"; title?: string; kind?: EventKind; date?: string;
        start_time?: string | null; end_time?: string | null; important?: boolean; yearly?: boolean; person?: string; location?: string; notes?: string;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const changes: Parameters<typeof changeEvent>[3] = {
          title: args.title, kind: args.kind, important: args.important, yearly: args.yearly, person: args.person, location: args.location, notes: args.notes,
        };
        if (args.date !== undefined || args.start_time !== undefined || args.end_time !== undefined) {
          const { data: cur } = await db.from("events").select("starts_at, ends_at, all_day").eq("id", args.id).maybeSingle();
          if (!cur) return toolError("update_event: no such event");
          const date = args.date ?? dayKey(new Date(cur.starts_at), tz);
          const start = args.start_time === undefined ? (cur.all_day ? null : formatLocal(new Date(cur.starts_at), tz).slice(11)) : args.start_time;
          changes.allDay = start === null;
          changes.startsAt = zonedInstant(date, start ?? "00:00", tz);
          const end = args.end_time === undefined ? (cur.ends_at ? formatLocal(new Date(cur.ends_at), tz).slice(11) : null) : args.end_time;
          changes.endsAt = start && end ? zonedInstant(date, end, tz) : null;
        }
        return ok(await withMode(db, new Date(), { ...(await changeEvent(db, args.id, args.action, changes)) }));
      } catch (error) {
        return toolError(`update_event failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "Upcoming events (default next 60 days) grouped by attention: prepare_now (important, within a week), " +
        "plan_ahead (important, further out — is any prep needed?), fit_in (not important, soon — only if there's " +
        "room), someday (not important, later).",
      inputSchema: z.object({ days: z.number().int().min(1).max(366).default(60) }),
      annotations: { readOnlyHint: true },
    },
    async ({ days }: { days: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const views = upcoming(await loadUpcomingEvents(db), now, days, undefined, (await loadSchedule(db)).eventCloseDays);
        const group = (q: string) =>
          views.filter((v) => v.quadrant === q).map((v) => ({ id: v.id, title: v.title, kind: v.kind, when: v.allDay ? dayKey(v.at, tz) : formatLocal(v.at, tz), daysAway: v.daysAway }));
        return ok(await withMode(db, now, { prepare_now: group("prepare_now"), plan_ahead: group("plan_ahead"), fit_in: group("fit_in"), someday: group("someday") }));
      } catch (error) {
        return toolError(`list_events failed: ${(error as Error).message}`);
      }
    },
  );
}
