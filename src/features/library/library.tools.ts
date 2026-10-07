import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { MEDIA_KINDS, MEDIA_STATUS, type MediaKind, type MediaStatus } from "./library";
import { loadFavorites, loadMedia, removeFavorite, saveFavorite, saveMedia } from "./library.repo";

export function registerLibraryTools(server: McpServer) {
  server.registerTool(
    "get_library",
    {
      title: "Library and favourites",
      description:
        "Books, films, series, music, podcasts and games they want to get to, are on, or finished (with ratings and " +
        "notes), and their favourite things (song, food, artist, place…). Use it to recommend what's next, to suggest " +
        "fun, and to know them.",
      inputSchema: z.object({ kind: z.enum(MEDIA_KINDS).optional(), status: z.enum(MEDIA_STATUS).optional() }),
      annotations: { readOnlyHint: true },
    },
    async (args: { kind?: MediaKind; status?: MediaStatus }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const [media, favorites] = await Promise.all([loadMedia(db, args), loadFavorites(db)]);
        return ok(await withMode(db, new Date(), { media, favorites }));
      } catch (error) {
        return toolError(`get_library failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "save_media",
    {
      title: "Save to library",
      description:
        "Add or update a book, film, series, album, podcast or game (matched by kind + title): want to, in progress, " +
        "done or dropped, with a 1–5 rating and notes. For a book's reading sessions use log_learning as well.",
      inputSchema: z.object({
        kind: z.enum(MEDIA_KINDS),
        title: z.string().trim().min(1).max(200),
        creator: z.string().trim().max(200).optional().describe("Author, director, artist…"),
        status: z.enum(MEDIA_STATUS).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        notes: z.string().trim().max(2000).optional(),
      }),
    },
    async (args: { kind: MediaKind; title: string; creator?: string; status?: MediaStatus; rating?: number; notes?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await saveMedia(db, args, now)) }));
      } catch (error) {
        return toolError(`save_media failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "save_favorite",
    {
      title: "Save a favourite",
      description: "A favourite thing: category in their words (song, food, artist, place, colour, verse…) and what it is. `remove` to take one off.",
      inputSchema: z.object({
        category: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(200),
        note: z.string().trim().max(500).optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (args: { category: string; value: string; note?: string; remove?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const result = args.remove ? await removeFavorite(db, args) : await saveFavorite(db, args);
        return ok(await withMode(db, new Date(), { ...result }));
      } catch (error) {
        return toolError(`save_favorite failed: ${(error as Error).message}`);
      }
    },
  );
}
