import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { updateTask } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { formatLocal } from "@/shared/time";
import { CHANNELS, type Channel } from "./updates";
import { addUpdate, draftMaterial, listUpdates, markUpdateSent, setUpdateActive } from "./updates.repo";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

export function registerUpdateTools(server: McpServer) {
  server.registerTool(
    "add_update",
    {
      title: "Add update",
      description:
        "Something the user owes someone regularly or once: a weekly report to a manager, a progress note to a mentor, a " +
        "spreadsheet to keep current. Give recipient, channel, what it covers, an optional format ('3 bullets: done, " +
        "next, blockers'), and a cadence (FREQ=WEEKLY;BYDAY=FR) or a due date. It becomes a task, reminded the " +
        "morning of and 30 minutes before. If the result is clash/over_capacity, offer another time.",
      inputSchema: z.object({
        recipient: z.string().trim().min(1),
        channel: z.enum(CHANNELS),
        about: z.string().trim().min(1),
        format: z.string().trim().optional(),
        recurrence: z.string().optional(),
        due_date: z.iso.date().optional(),
        due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      }),
    },
    async (args: { recipient: string; channel: Channel; about: string; format?: string; recurrence?: string; due_date?: string; due_time?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await addUpdate(db, { ...args, dueDate: args.due_date, dueTime: args.due_time }, now)) }));
      } catch (error) {
        return toolError(`add_update failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_updates",
    {
      title: "List updates",
      description: "The updates the user owes: recipient, channel, topic, next due, and when the user last sent each.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const rows = await listUpdates(db);
        return ok(
          await withMode(db, new Date(), {
            updates: rows.map((u) => {
              const t = u.tasks as unknown as { due_at: string | null; recurrence: string | null } | null;
              return {
                id: u.id, recipient: u.recipient, channel: u.channel, about: u.about, format: u.format, active: u.active,
                cadence: t?.recurrence ?? "one-off",
                lastSent: u.last_sent_at ? formatLocal(new Date(u.last_sent_at), tz()) : "never",
              };
            }),
          }),
        );
      } catch (error) {
        return toolError(`list_updates failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "draft_update",
    {
      title: "Draft update",
      description:
        "Get what the user actually did since the last update (completed tasks, learning, workouts, application " +
        "milestones), then write the update yourself: in their voice, in the given format, for that recipient and " +
        "channel, using only items relevant to `about` (skip private life stuff for a work update). Never invent " +
        "work — if the digest is thin or empty, say so and ask what to add. Show the draft; after the user sends it, " +
        "call mark_update_sent.",
      inputSchema: z.object({ id: z.uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }: { id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const material = await draftMaterial(db, id, now);
        if (!material) return toolError("draft_update: no such update");
        return ok(
          await withMode(db, now, {
            recipient: material.update.recipient,
            channel: material.update.channel,
            about: material.update.about,
            format: material.update.format,
            since: formatLocal(new Date(material.since), tz()),
            digest: material.digest,
            lastSent: material.lastSent ? { at: formatLocal(new Date(material.lastSent.sent_at), tz()), content: material.lastSent.content } : null,
          }),
        );
      } catch (error) {
        return toolError(`draft_update failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "mark_update_sent",
    {
      title: "Mark update sent",
      description: "The user sent it. Logs it (with the text, if given — the next draft starts from here) and completes today's update task.",
      inputSchema: z.object({ id: z.uuid(), content: z.string().max(5000).optional() }),
    },
    async ({ id, content }: { id: string; content?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await markUpdateSent(db, id, content ?? null, now)) }));
      } catch (error) {
        return toolError(`mark_update_sent failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "change_update",
    {
      title: "Change update",
      description: "Pause or resume an update (pausing a regular one stops its task), or change its time/cadence via update_task on its task.",
      inputSchema: z.object({ id: z.uuid(), active: z.boolean() }),
    },
    async ({ id, active }: { id: string; active: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const result = await setUpdateActive(db, id, active);
        if (!active) {
          const { data } = await db.from("updates").select("task_id").eq("id", id).maybeSingle();
          if (data?.task_id) await updateTask(db, data.task_id, {}, "stop");
        }
        return ok(await withMode(db, new Date(), { result, ...(active ? { note: "Resumed. To schedule it again, add_update a fresh cadence or add_task." } : {}) }));
      } catch (error) {
        return toolError(`change_update failed: ${(error as Error).message}`);
      }
    },
  );
}
