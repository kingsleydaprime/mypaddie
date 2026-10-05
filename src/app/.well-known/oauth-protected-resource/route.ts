import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { authIssuer } from "@/shared/supabase/env";

// RFC 9728: tells Claude which authorization server issues tokens for this
// MCP server — Supabase Auth — so it knows where to send you to log in.
export function GET(req: Request) {
  return protectedResourceHandler({ authServerUrls: [authIssuer()] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
