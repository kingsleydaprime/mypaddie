import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addItems, createList, findList, loadLists, setItemDone, updateItem, updateList, type LoadedList } from "./lists.repo";

const view = (l: LoadedList, withItems: boolean) => ({
  id: l.id,
  title: l.title,
  description: l.description,
  ...(l.showProgress ? { progress: `${l.progress.done} of ${l.progress.total} (${l.progress.percent}%)` } : { count: l.progress.total }),
  ...(withItems ? { items: l.items.map((i) => ({ id: i.id, text: i.text, done: i.done, note: i.note })) } : {}),
});

export function registerListTools(server: McpServer) {
  server.registerTool(
    "get_lists",
    {
      title: "Lists",
      description:
        "Their own lists — bucket list, gift ideas, places to visit, anything — with progress. Pass `list` (title) for " +
        "its items. Use these whenever they mention something that belongs on one.",
      inputSchema: z.object({ list: z.string().trim().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ list }: { list?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        if (list) {
          const l = await findList(db, list);
          if (!l) return toolError(`get_lists: no list called "${list}" — create_list makes one`);
          return ok(await withMode(db, new Date(), { list: view(l, true) }));
        }
        return ok(await withMode(db, new Date(), { lists: (await loadLists(db)).map((l) => view(l, false)) }));
      } catch (error) {
        return toolError(`get_lists failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "create_list",
    {
      title: "Create list",
      description:
        "Make a new list of anything, optionally with its first items. \"Bucket list\" is special: ticking an item off " +
        "for the first time pays +50 XP, like a wish coming true. Set show_progress false for lists that aren't about " +
        "finishing (gift ideas, favourite quotes).",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).optional(),
        show_progress: z.boolean().default(true),
        items: z.array(z.string().trim().min(1).max(300)).default([]),
      }),
    },
    async (args: { title: string; description?: string; show_progress: boolean; items: string[] }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { ...(await createList(db, { ...args, showProgress: args.show_progress })) }));
      } catch (error) {
        return toolError(`create_list failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_list",
    {
      title: "Update list",
      description:
        "Work with one list (by title): `add` items; `tick` / `untick` an item (by id or its text); edit or remove an " +
        "item; rename the list, change its description or progress display, or delete it. Celebrate bucket-list ticks.",
      inputSchema: z.object({
        list: z.string().trim().min(1),
        add: z.array(z.string().trim().min(1).max(300)).optional(),
        tick: z.string().trim().optional().describe("Item id or text"),
        untick: z.string().trim().optional(),
        item: z.string().trim().optional().describe("Item id or text to edit/remove"),
        item_text: z.string().trim().max(300).optional(),
        item_note: z.string().trim().max(1000).nullable().optional(),
        remove_item: z.boolean().optional(),
        title: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        show_progress: z.boolean().optional(),
        delete_list: z.boolean().optional(),
      }),
    },
    async (
      args: { list: string; add?: string[]; tick?: string; untick?: string; item?: string; item_text?: string; item_note?: string | null; remove_item?: boolean; title?: string; description?: string | null; show_progress?: boolean; delete_list?: boolean },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const l = await findList(db, args.list);
        if (!l) return toolError(`update_list: no list called "${args.list}"`);
        const find = (ref: string) => l.items.find((i) => i.id === ref || i.text.trim().toLowerCase() === ref.trim().toLowerCase());
        const out: Record<string, unknown> = {};
        if (args.add?.length) out.added = await addItems(db, l.id, args.add);
        for (const [ref, done] of [[args.tick, true], [args.untick, false]] as const) {
          if (!ref) continue;
          const it = find(ref);
          out[done ? "ticked" : "unticked"] = it ? await setItemDone(db, it.id, done, now) : { result: "no_such_item", item: ref };
        }
        if (args.item) {
          const it = find(args.item);
          out.item = it ? await updateItem(db, it.id, { text: args.item_text, note: args.item_note, remove: args.remove_item }) : { result: "no_such_item" };
        }
        if (args.title || args.description !== undefined || args.show_progress !== undefined || args.delete_list) {
          out.list = await updateList(db, l.id, { title: args.title, description: args.description, showProgress: args.show_progress, remove: args.delete_list });
        }
        return ok(await withMode(db, now, out));
      } catch (error) {
        return toolError(`update_list failed: ${(error as Error).message}`);
      }
    },
  );
}
