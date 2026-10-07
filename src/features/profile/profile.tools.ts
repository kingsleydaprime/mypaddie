import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { VOICES, type Voice } from "./profile";
import { loadProfile, updateProfile } from "./profile.repo";

export function registerProfileTools(server: McpServer) {
  server.registerTool(
    "update_profile",
    {
      title: "Update profile",
      description:
        "Change what Paddie calls them, their time zone (IANA name, e.g. Africa/Lagos, Africa/Accra, Europe/London — " +
        "when they move or travel for a while), their currency (ISO code: NGN, GHS, KES, ZAR, GBP, USD…) or your voice " +
        "(naija = Naija banter; neutral = plain English). Only what they ask to change. A new currency doesn't convert " +
        "old amounts — say so if they have money logged.",
      inputSchema: z.object({
        name: z.string().trim().max(60).nullable().optional(),
        time_zone: z.string().trim().min(1).optional(),
        currency: z.string().trim().length(3).transform((c) => c.toUpperCase()).optional(),
        voice: z.enum(VOICES).optional(),
      }),
    },
    async (args: { name?: string | null; time_zone?: string; currency?: string; voice?: Voice }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const result = await updateProfile(db, { displayName: args.name, timeZone: args.time_zone, currency: args.currency, voice: args.voice });
        if (!result.ok) return toolError(`update_profile: ${result.error}`);
        return ok(await withMode(db, new Date(), { profile: { ...result.profile }, ...(args.time_zone ? { note: "Takes effect from their next message." } : {}) }));
      } catch (error) {
        return toolError(`update_profile failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description: "Their name, time zone, currency and preferred voice.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        return ok({ profile: { ...(await loadProfile(db)) } });
      } catch (error) {
        return toolError(`get_profile failed: ${(error as Error).message}`);
      }
    },
  );
}
