import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findCommitment } from "@/features/commitments/commitments.repo";
import { withMode } from "@/features/mode/mode.repo";
import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey, formatLocal, zonedInstant } from "@/shared/time";
import { EVENT_KINDS, upcoming, type EventKind } from "./events";
import { addEvent } from "./add-event";
import { changeEvent, loadUpcomingEvents } from "./events.repo";
import { finishEvent, startEvent } from "./event-progress";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
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
  reminder_note: z.string().trim().max(200).optional().describe("Their own words for the notifications, e.g. 'Buy flowers on the way'"),
  self_care: z
    .boolean()
    .optional()
    .describe(
      "Self-care events take time in the day but not from their work hours. Default by kind: social, birthday, " +
        "anniversary and wedding are self-care; the rest are work. Set it when they say otherwise (a doctor's appointment, a networking 'social').",
    ),
};

export function registerEventTools(server: McpServer) {
  server.registerTool(
    "add_event",
    {
      title: "Add event",
      description:
        "Something to attend or remember — a meeting, party, birthday, anniversary, wedding, appointment. (Things " +
        "to *do* are tasks.) Ask whether it's important if unclear: important ones are reminded a week ahead and " +
        "the morning of, and timed ones 10 min before and when they start; all are reminded the evening before and " +
        "30 min before. Birthdays/anniversaries repeat " +
        "yearly. For important events that need preparation (a gift, an outfit, travel), pass prep to create a " +
        "prep task ahead of it. If `clashes` comes back non-empty, tell them what overlaps.",
      inputSchema: z.object({
        ...fields,
        prep: z
          .object({ days_before: z.number().int().min(1).max(90), title: z.string().trim().min(1).optional(), duration_minutes: z.number().int().min(5).max(600).optional() })
          .optional(),
        commitment: z.string().trim().min(1).optional().describe("The job, role, team or group it's for (title or id from list_commitments): a competition, election, meeting"),
      }),
    },
    async (
      args: {
        title: string; kind: EventKind; date: string; start_time?: string; end_time?: string; important: boolean; yearly?: boolean;
        person?: string; location?: string; notes?: string; reminder_note?: string; prep?: { days_before: number; title?: string; duration_minutes?: number };
        commitment?: string; self_care?: boolean;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const commitment = args.commitment ? await findCommitment(db, args.commitment) : null;
        if (args.commitment && !commitment) return toolError(`add_event: no single commitment matches "${args.commitment}" — check list_commitments`);
        const created = await addEvent(db, { ...args, commitment_id: commitment?.id ?? null }, now);
        if ("error" in created) return toolError(`add_event: ${created.error}`);
        return ok(await withMode(db, now, { ...created }));
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
        reminder_note: z.string().trim().max(200).nullable().optional(),
        self_care: fields.self_care.describe("Changing `kind` without this resets it to the new kind's default."),
      }),
    },
    async (
      args: {
        id: string; action: "edit" | "cancel" | "done" | "delete"; title?: string; kind?: EventKind; date?: string;
        start_time?: string | null; end_time?: string | null; important?: boolean; yearly?: boolean; person?: string; location?: string; notes?: string; reminder_note?: string | null;
        self_care?: boolean;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const changes: Parameters<typeof changeEvent>[3] = {
          title: args.title, kind: args.kind, important: args.important, yearly: args.yearly, person: args.person, location: args.location, notes: args.notes,
          reminderNote: args.reminder_note,
          selfCare: args.self_care,
        };
        if (args.date !== undefined || args.start_time !== undefined || args.end_time !== undefined) {
          const { data: cur } = await db.from("events").select("starts_at, ends_at, all_day").eq("id", args.id).maybeSingle();
          if (!cur) return toolError("update_event: no such event");
          const date = args.date ?? dayKey(new Date(cur.starts_at), tz());
          const start = args.start_time === undefined ? (cur.all_day ? null : formatLocal(new Date(cur.starts_at), tz()).slice(11)) : args.start_time;
          changes.allDay = start === null;
          changes.startsAt = zonedInstant(date, start ?? "00:00", tz());
          const end = args.end_time === undefined ? (cur.ends_at ? formatLocal(new Date(cur.ends_at), tz()).slice(11) : null) : args.end_time;
          changes.endsAt = start && end ? zonedInstant(date, end, tz()) : null;
        }
        return ok(await withMode(db, new Date(), { ...(await changeEvent(db, args.id, args.action, changes)) }));
      } catch (error) {
        return toolError(`update_event failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "start_event",
    {
      title: "Start an event",
      description:
        "They're in a meeting or event before its time ('the call started early'). A timed one-off event is in " +
        "progress by itself once its time comes, so this is only for starting early. It takes over: a task that's " +
        "running is paused (time kept) — say so. All-day and yearly events (birthdays) can't be started.",
      inputSchema: z.object({ event_id: z.uuid().describe("From list_events or get_today") }),
    },
    async ({ event_id }: { event_id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await startEvent(db, event_id, now)) }));
      } catch (error) {
        return toolError(`start_event failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "complete_event",
    {
      title: "Finish an event",
      description:
        "A meeting or event is over and they were there: mark it done. not_at_it=true when they didn't go or left it " +
        "(it's dropped, no judgement). Either way it stops being in progress. Not for birthdays or other yearly events.",
      inputSchema: z.object({ event_id: z.uuid(), not_at_it: z.boolean().default(false) }),
    },
    async ({ event_id, not_at_it }: { event_id: string; not_at_it: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await finishEvent(db, event_id, not_at_it ? "not_at_it" : "done")) }));
      } catch (error) {
        return toolError(`complete_event failed: ${(error as Error).message}`);
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
          views.filter((v) => v.quadrant === q).map((v) => ({ id: v.id, title: v.title, kind: v.kind, when: v.allDay ? dayKey(v.at, tz()) : formatLocal(v.at, tz()), daysAway: v.daysAway }));
        return ok(await withMode(db, now, { prepare_now: group("prepare_now"), plan_ahead: group("plan_ahead"), fit_in: group("fit_in"), someday: group("someday") }));
      } catch (error) {
        return toolError(`list_events failed: ${(error as Error).message}`);
      }
    },
  );
}
