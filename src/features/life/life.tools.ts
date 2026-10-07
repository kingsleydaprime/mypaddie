import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { achieveMilestone, addMilestone, loadLifeMap, loadMilestones, loadTimeline, updateMilestone } from "./life.repo";

const weights = z
  .array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) }))
  .min(1)
  .refine((ws) => ws.reduce((s, w) => s + w.weight, 0) === 100, "weights must sum to 100");

function run<A>(name: string, fn: (args: A, ctx: ToolContext, now: Date) => Promise<Record<string, unknown>>) {
  return async (args: A, ctx: ToolContext) => {
    try {
      const db = dbFrom(ctx);
      const now = new Date();
      return ok(await withMode(db, now, await fn(args, ctx, now)));
    } catch (error) {
      return toolError(`${name} failed: ${(error as Error).message}`);
    }
  };
}

export function registerLifeTools(server: McpServer) {
  server.registerTool(
    "get_life_map",
    {
      title: "Life map",
      description:
        "Every area of life on one page — body, mind, money, people, faith, work & school, fun — each 'good', 'okay', " +
        "'attention' or 'unknown', with the facts behind it (from trends, XP in the last 2 weeks vs before, money, " +
        "people due, fun). `focus` is the one area to give attention this week. Lead with that one area and one small " +
        "step, not a tour of all seven; 'unknown' means nothing's logged there yet, not that it's fine.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run("get_life_map", async (_a: Record<string, never>, ctx, now) => ({ ...(await loadLifeMap(dbFrom(ctx), now)) })),
  );

  server.registerTool(
    "add_milestone",
    {
      title: "Add milestone or moment",
      description:
        "kind 'milestone': a checkpoint under a goal or dream (item_id from list_items) — hitting it pays 3× XP, once. " +
        "Break a dream into 3–5 of these when it's added. kind 'moment': a big life event for the timeline (graduated, " +
        "first job, moved city), past or planned, with `before` (what life looked like) and `after` (what changed) in " +
        "their words; a dated moment in the past is recorded as having happened. Moments pay nothing.",
      inputSchema: z.object({
        kind: z.enum(["milestone", "moment"]),
        title: z.string().trim().min(1).max(200),
        item_id: z.uuid().optional(),
        date: z.iso.date().optional().describe("Planned for; for a past moment, when it happened"),
        happened: z.boolean().optional().describe("A moment that already happened, even without a date"),
        before: z.string().max(1000).optional(),
        after: z.string().max(1000).optional(),
        note: z.string().max(1000).optional(),
      }),
    },
    run("add_milestone", async (a: { kind: "milestone" | "moment"; title: string; item_id?: string; date?: string; happened?: boolean; before?: string; after?: string; note?: string }, ctx, now) => ({
      ...(await addMilestone(dbFrom(ctx), { kind: a.kind, title: a.title, itemId: a.item_id, date: a.date, happened: a.happened, before: a.before, after: a.after, note: a.note }, now)),
    })),
  );

  server.registerTool(
    "achieve_milestone",
    {
      title: "Hit a milestone",
      description:
        "They hit it (by id from list_milestones or get_timeline). A milestone pays 3× its goal's or dream's base XP " +
        "to the pillars that goal's tasks feed; 'needs_weights' means there are no tasks to go on — ask which pillars it " +
        "served. Pays once ever. Ask what changed and pass it as `after` for the timeline. Celebrate it properly.",
      inputSchema: z.object({ id: z.uuid(), on: z.iso.date().optional(), weights: weights.optional(), after: z.string().max(1000).optional() }),
    },
    run("achieve_milestone", async (a: { id: string; on?: string; weights?: { pillar: (typeof PILLARS)[number]; weight: number }[]; after?: string }, ctx, now) => ({
      ...(await achieveMilestone(dbFrom(ctx), a.id, { on: a.on, weights: a.weights, after: a.after }, now)),
    })),
  );

  server.registerTool(
    "update_milestone",
    {
      title: "Update milestone or moment",
      description: "Rename, re-date, drop (or bring back to planned), or add what came before / after. By id or title.",
      inputSchema: z.object({
        milestone: z.string().trim().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        date: z.iso.date().nullable().optional(),
        status: z.enum(["planned", "dropped"]).optional(),
        before: z.string().max(1000).nullable().optional(),
        after: z.string().max(1000).nullable().optional(),
        note: z.string().max(1000).nullable().optional(),
      }),
    },
    run("update_milestone", async (a: { milestone: string; title?: string; date?: string | null; status?: "planned" | "dropped"; before?: string | null; after?: string | null; note?: string | null }, ctx) => {
      const { milestone, ...changes } = a;
      return { ...(await updateMilestone(dbFrom(ctx), milestone, changes)) };
    }),
  );

  server.registerTool(
    "get_timeline",
    {
      title: "Life timeline",
      description:
        "Their life's big moments and milestones in order: what's happened, then what's planned (overdue, ahead, " +
        "someday). Each has the one before and after it, plus their own before/after notes. With item_id: just that " +
        "goal's or dream's milestones.",
      inputSchema: z.object({ item_id: z.uuid().optional() }),
      annotations: { readOnlyHint: true },
    },
    run("get_timeline", async (a: { item_id?: string }, ctx, now) =>
      a.item_id ? { milestones: await loadMilestones(dbFrom(ctx), a.item_id) } : { timeline: await loadTimeline(dbFrom(ctx), now) }),
  );
}
