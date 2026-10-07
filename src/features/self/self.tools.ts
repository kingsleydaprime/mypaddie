import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { SELF_KINDS, type SelfKind } from "./self";
import { addSelfNote, loadSelf, updateSelfNote } from "./self.repo";

export function registerSelfTools(server: McpServer) {
  server.registerTool(
    "get_self",
    {
      title: "About me",
      description:
        "What they know about themselves: strengths, weak spots, things they're healing from (and how they're working on " +
        "them), patterns, triggers, good habits and habits to break, history. Use it to tailor advice — \"you tend to " +
        "overcommit in exam weeks, so I wouldn't take this on\" — kindly and specifically, never to shame. get_today " +
        "already carries the short version.",
      inputSchema: z.object({ include_resolved: z.boolean().default(false) }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_resolved }: { include_resolved: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { notes: await loadSelf(db, { includeResolved: include_resolved }) }));
      } catch (error) {
        return toolError(`get_self failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "add_self_note",
    {
      title: "Note about me",
      description:
        "Save something true about them, in their words: a strength, a weak spot, something they're healing from, a " +
        "pattern you've both noticed (\"skips mornings after late nights\"), a trigger, a good habit or one to break, or " +
        "a piece of their history. Offer to save patterns you notice — ask first; it's their story. `working_on` = how " +
        "they're tackling it.",
      inputSchema: z.object({
        kind: z.enum(SELF_KINDS),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(2000).optional(),
        working_on: z.string().trim().max(1000).optional(),
        since: z.iso.date().optional(),
      }),
    },
    async (args: { kind: SelfKind; title: string; detail?: string; working_on?: string; since?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await addSelfNote(db, { ...args, workingOn: args.working_on })) }));
      } catch (error) {
        return toolError(`add_self_note failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_self_note",
    {
      title: "Update note about me",
      description: "Edit a note (id from get_self), record progress in `working_on`, mark it resolved (healed, habit broken — celebrate that), or remove it.",
      inputSchema: z.object({
        id: z.uuid(),
        kind: z.enum(SELF_KINDS).optional(),
        title: z.string().trim().min(1).max(200).optional(),
        detail: z.string().trim().max(2000).nullable().optional(),
        working_on: z.string().trim().max(1000).nullable().optional(),
        status: z.enum(["active", "resolved"]).optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (args: { id: string; kind?: SelfKind; title?: string; detail?: string | null; working_on?: string | null; status?: "active" | "resolved"; remove?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { id, working_on, ...rest } = args;
        return ok(await withMode(db, new Date(), { ...(await updateSelfNote(db, id, { ...rest, workingOn: working_on })) }));
      } catch (error) {
        return toolError(`update_self_note failed: ${(error as Error).message}`);
      }
    },
  );
}
