import type { AuthInfo } from "@modelcontextprotocol/server";
import { clientForToken, type Db } from "@/shared/supabase/token-client";

/** The part of a tool callback's context we use. */
export type ToolContext = { http?: { authInfo?: AuthInfo } };

/** A database client acting as the signed-in caller. Every query is RLS-scoped. */
export function dbFrom(ctx: ToolContext): Db {
  const token = ctx.http?.authInfo?.token;
  if (!token) throw new Error("not authenticated");
  return clientForToken(token);
}

/**
 * Tool results carry both: `structuredContent` for clients that read JSON,
 * and the same JSON as text for clients that only show text.
 */
export function ok<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/** A tool-level failure the model can read and react to, not a protocol error. */
export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
