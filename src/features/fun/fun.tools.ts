import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { FUN_COMPANY, FUN_ENERGY, type FunActivity, type FunCompany, type FunEnergy } from "./fun";
import { addFun, loadFunPicture, logFun, updateFun } from "./fun.repo";

const view = (a: FunActivity) => ({
  title: a.title,
  notes: a.notes,
  cost: a.cost,
  minutes: a.minutes,
  energy: a.energy,
  company: a.company,
  active: a.active,
  timesDone: a.timesDone,
  lastDone: a.lastDoneAt?.toISOString().slice(0, 10) ?? null,
});

const fields = {
  notes: z.string().trim().max(500).optional(),
  cost: z.number().int().min(0).optional().describe("Rough cost in naira; 0 = free"),
  minutes: z.number().int().min(5).max(1440).optional().describe("Roughly how long it takes"),
  energy: z.enum(FUN_ENERGY).optional().describe("How much it takes out of him"),
  company: z.enum(FUN_COMPANY).optional().describe("solo, together (with people), or either"),
};

export function registerFunTools(server: McpServer) {
  server.registerTool(
    "list_fun",
    {
      title: "Fun list",
      description:
        "His fun list, days since he last had any fun, and up to `limit` suggestions that fit right now: free time, " +
        "money (only free fun in a deficit; nothing over what's left for wants) and mood (no high-energy fun on a " +
        "soft day), least recently done first. Use when he asks for help having fun or a fun life, when his quests " +
        "are done, or to fill free time from plan_day. Offer one or two, not the whole list. Rest is part of the game.",
      inputSchema: z.object({
        minutes_free: z.number().int().min(5).max(1440).optional().describe("Only things that fit this much time"),
        with_people: z.boolean().optional().describe("true = with friends, false = alone; omit for either"),
        limit: z.number().int().min(1).max(10).default(3),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ minutes_free, with_people, limit }: { minutes_free?: number; with_people?: boolean; limit: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const picture = await loadFunPicture(db, new Date(), { minutesFree: minutes_free, withPeople: with_people, limit });
        return ok({
          daysSinceFun: picture.daysSinceFun,
          suggestions: picture.suggestions,
          budget: picture.budget,
          list: picture.activities.map(view),
          mode: picture.mode,
        });
      } catch (error) {
        return toolError(`list_fun failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "add_fun",
    {
      title: "Add fun",
      description:
        "Add something he enjoys to his fun list (e.g. football with the guys, a movie, the beach, gaming). Ask " +
        "only for what's unclear; rough cost, time, energy and company make the suggestions better.",
      inputSchema: z.object({ title: z.string().trim().min(1).max(100), ...fields }),
    },
    async (
      args: { title: string; notes?: string; cost?: number; minutes?: number; energy?: FunEnergy; company?: FunCompany },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const result = await addFun(db, args);
        return ok(await withMode(db, new Date(), result.result === "added" ? { result: result.result, activity: view(result.activity) } : { ...result }));
      } catch (error) {
        return toolError(`add_fun failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_fun",
    {
      title: "Update fun",
      description:
        "Edit an activity on his fun list (by title), pause it (active=false: kept but not suggested), or remove it. " +
        "Removing keeps past fun on the record.",
      inputSchema: z.object({
        activity: z.string().trim().min(1).describe("Its title (or id)"),
        title: z.string().trim().min(1).max(100).optional().describe("New title"),
        ...fields,
        notes: z.string().trim().max(500).nullable().optional(),
        minutes: z.number().int().min(5).max(1440).nullable().optional(),
        active: z.boolean().optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (
      args: { activity: string; title?: string; notes?: string | null; cost?: number; minutes?: number | null; energy?: FunEnergy; company?: FunCompany; active?: boolean; remove?: boolean },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const { activity, ...changes } = args;
        return ok(await withMode(db, new Date(), { ...(await updateFun(db, activity, changes)) }));
      } catch (error) {
        return toolError(`update_fun failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "log_fun",
    {
      title: "Log fun",
      description:
        "He had fun: record it and pay XP (emotional, plus social with people). Something not on his list yet is " +
        "added to it. If it cost money, also log the spend with log_transaction (as a want). To plan fun for later " +
        "instead, use add_task with fun=<title> so completing it counts.",
      inputSchema: z.object({
        activity: z.string().trim().min(1).max(100).describe("Title from his list, or something new"),
        with_people: z.boolean().optional(),
        minutes: z.number().int().min(5).max(1440).optional(),
      }),
    },
    async ({ activity, with_people, minutes }: { activity: string; with_people?: boolean; minutes?: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await logFun(db, { activity, withPeople: with_people, minutes }, now)) }));
      } catch (error) {
        return toolError(`log_fun failed: ${(error as Error).message}`);
      }
    },
  );
}
