import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addQuote, deleteQuote, loadQuotes } from "./quotes.repo";

export function registerQuoteTools(server: McpServer) {
  server.registerTool(
    "save_quote",
    {
      title: "Save a quote",
      description:
        "Save a line that keeps them going — a quote, a verse, something someone said to them. One shows on Home each " +
        "day; their own come up more often than the built-in ones. Save it in their words, with who said it if they know.",
      inputSchema: z.object({ text: z.string().trim().min(1).max(500), author: z.string().trim().max(120).optional() }),
    },
    async ({ text, author }: { text: string; author?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), await addQuote(db, { text, author })));
      } catch (error) {
        return toolError(`save_quote failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_quotes",
    { title: "List quotes", description: "Their saved quotes, oldest first, with ids for delete_quote.", inputSchema: z.object({}) },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), { quotes: await loadQuotes(db) }));
      } catch (error) {
        return toolError(`list_quotes failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "delete_quote",
    { title: "Delete a quote", description: "Remove one of their saved quotes (id from list_quotes).", inputSchema: z.object({ id: z.uuid() }) },
    async ({ id }: { id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok(await withMode(db, new Date(), await deleteQuote(db, id)));
      } catch (error) {
        return toolError(`delete_quote failed: ${(error as Error).message}`);
      }
    },
  );
}
