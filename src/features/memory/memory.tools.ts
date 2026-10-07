import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { escapeLike } from "@/shared/supabase/like";

export function registerMemoryTools(server: McpServer) {
  server.registerTool(
    "save_memory",
    {
      title: "Save memory",
      description:
        "Store a fact or pattern worth remembering about the user (a preference, a recurring challenge in their own " +
        "words, something that worked). Use a short category like 'challenge', 'preference', 'pattern', 'win'.",
      inputSchema: z.object({
        category: z.string().trim().min(1).max(40),
        text: z.string().trim().min(1),
        source: z.string().optional().describe("Where it came from, e.g. 'chat', 'slip pattern'"),
      }),
    },
    async (args: { category: string; text: string; source?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { data, error } = await db
          .from("memories")
          .insert({ category: args.category.toLowerCase(), text: args.text, source: args.source ?? "chat" })
          .select("id, category, text")
          .single();
        if (error) return toolError(`save_memory failed: ${error.message}`);
        return ok(await withMode(db, new Date(), { memory: data }));
      } catch (error) {
        return toolError(`save_memory failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "recall_memory",
    {
      title: "Recall memory",
      description: "Look up stored facts and patterns, by category and/or a word or phrase in the text. Newest first.",
      inputSchema: z.object({
        query: z.string().trim().min(1).optional(),
        category: z.string().trim().min(1).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args: { query?: string; category?: string; limit: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        let q = db.from("memories").select("id, category, text, source, at").order("at", { ascending: false }).limit(args.limit);
        if (args.category) q = q.eq("category", args.category.toLowerCase());
        if (args.query) q = q.ilike("text", `%${escapeLike(args.query)}%`);
        const { data, error } = await q;
        if (error) return toolError(`recall_memory failed: ${error.message}`);
        return ok(await withMode(db, new Date(), { memories: data }));
      } catch (error) {
        return toolError(`recall_memory failed: ${(error as Error).message}`);
      }
    },
  );
}
