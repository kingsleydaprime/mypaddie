import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerApplicationTools } from "@/features/applications/applications.tools";
import { registerCalendarTools } from "@/features/calendar/calendar.tools";
import { registerCommitmentTools } from "@/features/commitments/commitments.tools";
import { registerCourseTools } from "@/features/courses/courses.tools";
import { registerEventTools } from "@/features/events/events.tools";
import { registerFunTools } from "@/features/fun/fun.tools";
import { registerIdentityTools } from "@/features/identity/identity.tools";
import { registerItemTools } from "@/features/items/items.tools";
import { registerLearningTools } from "@/features/learning/learning.tools";
import { registerMemoryTools } from "@/features/memory/memory.tools";
import { registerModeTools } from "@/features/mode/mode.tools";
import { registerPantryTools } from "@/features/pantry/pantry.tools";
import { registerProfileTools } from "@/features/profile/profile.tools";
import { registerPromiseTools } from "@/features/promises/promises.tools";
import { registerPlanningTools } from "@/features/planning/planning.tools";
import { registerMoneyTools } from "@/features/money/money.tools";
import { registerSettingsTools } from "@/features/settings/settings.tools";
import { registerSlipTools } from "@/features/slips/slips.tools";
import { registerStatsTools } from "@/features/stats/stats.tools";
import { registerCapacityTools } from "@/features/tasks/capacity.tools";
import { registerTaskTools } from "@/features/tasks/tasks.tools";
import { registerTodayTools } from "@/features/today/today.tools";
import { registerUpdateTools } from "@/features/updates/updates.tools";
import { registerWorkoutTools } from "@/features/workouts/workouts.tools";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { verifyToken } from "@/shared/mcp/auth";
import { clientForToken } from "@/shared/supabase/token-client";
import { withUser } from "@/shared/user-context";

const handler = createMcpHandler(
  (server) => {
    registerTodayTools(server);
    registerTaskTools(server);
    registerCapacityTools(server);
    registerItemTools(server);
    registerLearningTools(server);
    registerSlipTools(server);
    registerModeTools(server);
    registerMoneyTools(server);
    registerStatsTools(server);
    registerMemoryTools(server);
    registerIdentityTools(server);
    registerWorkoutTools(server);
    registerPantryTools(server);
    registerEventTools(server);
    registerPlanningTools(server);
    registerSettingsTools(server);
    registerApplicationTools(server);
    registerUpdateTools(server);
    registerCalendarTools(server);
    registerFunTools(server);
    registerCourseTools(server);
    registerCommitmentTools(server);
    registerPromiseTools(server);
    registerProfileTools(server);
  },
  {
    serverInfo: { name: "mypaddie", version: "1.0.0" },
    instructions:
      "MyPaddie is the user's private life coach. Call get_today first in every chat. It returns `you`: their name " +
      "(use it) and their chosen voice. Voice 'naija': a deadpan game narrator with a big-brother streak and relaxed " +
      "Naija banter — a little pidgin is fine, never a caricature. Voice 'neutral': the same firm-but-funny coach in " +
      "plain, warm English with no slang. Either way: firm about the action, funny about the situation; the joke never " +
      "replaces the instruction; drop the jokes entirely if they're in real distress. Every tool result includes " +
      "`mode` (curious, strict, soft, strictest, softest) with the facts behind it — set your tone from it. get_today also " +
      "returns `becoming`, their 'Who I'm becoming' profile: praise choices that fit it, push back on ones that don't, and " +
      "never debate whether it's the right one. They can ask you to edit it (update_identity), or change their name, " +
      "time zone, currency or voice (update_profile). Money is whole units of their currency.",
  },
);

/** Per user: generous for a chat, a wall for a runaway loop. */
const RATE = { limit: 300, windowSeconds: 600 };

// Every tool call runs as the signed-in user: their time zone, currency and voice.
const asUser = async (req: Request) => {
  const token = (req as Request & { auth?: AuthInfo }).auth?.token;
  if (!token) return handler(req);
  const db = clientForToken(token);
  const { data: allowed } = await db.rpc("rate_hit", { p_bucket: "mcp", p_limit: RATE.limit, p_window_seconds: RATE.windowSeconds });
  if (allowed === false) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many MyPaddie requests in the last few minutes. Wait a little, then try again." } },
      { status: 429, headers: { "Retry-After": String(RATE.windowSeconds) } },
    );
  }
  return withUser(db, () => Promise.resolve(handler(req)));
};

// No token, a bad token, or an expired one → 401 pointing Claude at the login flow.
const authed = withMcpAuth(asUser, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authed as GET, authed as POST, authed as DELETE };
