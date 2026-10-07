import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { DEFAULT_CONFIG } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { formatLocal } from "@/shared/time";
import {
  addPromise,
  editPromise,
  keepPromise,
  loadPromisePicture,
  releasePromise,
  removePromise,
  renegotiatePromise,
  type LoadedPromise,
} from "./promises.repo";

const tz = DEFAULT_CONFIG.timeZone;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const due = z.object({ date: z.iso.date(), time: time.optional().describe("Omit = by the end of that day") });

const view = (p: LoadedPromise & { daysLeft?: number | null }) => ({
  id: p.id,
  person: p.person,
  what: p.what,
  due: p.dueAt ? formatLocal(p.dueAt, tz) : null,
  ...(p.daysLeft !== undefined ? { daysLeft: p.daysLeft } : {}),
  status: p.status,
  renegotiations: p.renegotiations,
  ...(p.keptAt ? { kept: formatLocal(p.keptAt, tz) } : {}),
  ...(p.notes ? { notes: p.notes } : {}),
});

export function registerPromiseTools(server: McpServer) {
  server.registerTool(
    "add_promise",
    {
      title: "Add promise",
      description:
        "Record a promise he made: to whom, what, and by when. Listen for them in passing ('I told Ada I'd send the " +
        "notes by Friday') and offer to log them. It goes on Today as a task that turns must-do the day before. Kept " +
        "on its day = +15 XP (character, relationships). Not kept, released or renegotiated by the end of its day = " +
        "broken: −15, and keeping it later earns back only half. If `dayFull` comes back, his day is full — the promise " +
        "is still recorded; suggest renegotiating the date or dropping something.",
      inputSchema: z.object({
        person: z.string().trim().min(1).max(100),
        what: z.string().trim().min(1).max(300),
        due: due.optional().describe("Omit for no deadline ('sometime') — tracked, never counted as broken"),
        notes: z.string().trim().max(1000).optional(),
      }),
    },
    async (args: { person: string; what: string; due?: { date: string; time?: string }; notes?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const made = await addPromise(db, args, now);
        return ok(await withMode(db, now, { promise: view(made.promise), ...(made.dayFull ? { dayFull: made.dayFull } : {}) }));
      } catch (error) {
        return toolError(`add_promise failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_promises",
    {
      title: "List promises",
      description:
        "Open promises (soonest first, with days left), recently kept/released/broken ones, and `patterns`: people " +
        "he's broken 2+ promises to in 90 days. Name a pattern plainly, once, and ask what would change it.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const pic = await loadPromisePicture(db, now);
        return ok(await withMode(db, now, { open: pic.open.map(view), recent: pic.recent.map(view), patterns: pic.patterns }));
      } catch (error) {
        return toolError(`list_promises failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_promise",
    {
      title: "Update promise",
      description:
        "One promise (id from list_promises): `kept` (completes its task: full XP on its day, half if late), " +
        "`released` (they let him off — no penalty if before its day ended), `renegotiate` to a new date (only " +
        "while its day hasn't ended, and only after he's actually told them — ask), edit person/what/notes, or " +
        "`remove` if it was logged by mistake. When a promise can't be kept, push him to tell the person before the " +
        "deadline, not after.",
      inputSchema: z.object({
        id: z.uuid(),
        kept: z.boolean().optional(),
        released: z.boolean().optional(),
        renegotiate: due.optional(),
        person: z.string().trim().min(1).max(100).optional(),
        what: z.string().trim().min(1).max(300).optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (
      args: { id: string; kept?: boolean; released?: boolean; renegotiate?: { date: string; time?: string }; person?: string; what?: string; notes?: string | null; remove?: boolean },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const result = args.remove
          ? await removePromise(db, args.id)
          : args.kept
            ? await keepPromise(db, args.id, now)
            : args.released
              ? await releasePromise(db, args.id, now)
              : args.renegotiate
                ? await renegotiatePromise(db, args.id, args.renegotiate, now)
                : await editPromise(db, args.id, { person: args.person, what: args.what, notes: args.notes });
        return ok(await withMode(db, now, { ...result }));
      } catch (error) {
        return toolError(`update_promise failed: ${(error as Error).message}`);
      }
    },
  );
}
