import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerApplicationTools } from "@/features/applications/applications.tools";
import { registerCalendarTools } from "@/features/calendar/calendar.tools";
import { registerCommitmentTools } from "@/features/commitments/commitments.tools";
import { registerCourseTools } from "@/features/courses/courses.tools";
import { registerEventTools } from "@/features/events/events.tools";
import { registerFunTools } from "@/features/fun/fun.tools";
import { registerLibraryTools } from "@/features/library/library.tools";
import { registerListTools } from "@/features/lists/lists.tools";
import { registerAchievementTools } from "@/features/achievements/achievements.tools";
import { registerMetricsTools } from "@/features/metrics/metrics.tools";
import { registerValuesTools } from "@/features/values/values.tools";
import { registerDecisionTools } from "@/features/decisions/decisions.tools";
import { registerReviewTools } from "@/features/reviews/reviews.tools";
import { registerRoutineTools } from "@/features/routines/routines.tools";
import { registerPeopleTools } from "@/features/people/people.tools";
import { registerSelfTools } from "@/features/self/self.tools";
import { catalogue, registerHelpTool } from "@/features/help/help.tools";
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
import { registerStatusTools } from "@/features/status/status.tools";
import { registerMealTools } from "@/features/pantry/meals.tools";
import { registerCloseOutTools } from "@/features/closeout/closeout.tools";
import { registerGuardrailTools } from "@/features/money/guardrails.tools";
import { registerUndoTools } from "@/features/undo/undo.tools";
import { registerWorkoutTools } from "@/features/workouts/workouts.tools";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { verifyToken } from "@/shared/mcp/auth";
import { clientForToken } from "@/shared/supabase/token-client";
import { withUser } from "@/shared/user-context";

const handler = createMcpHandler(
  (server) => {
    // Every tool is catalogued by area as it's registered; what_can_paddie_do lists them.
    const tools = catalogue(server);
    tools.area("Today", () => registerTodayTools(server));
    tools.area("Tasks and habits", () => registerTaskTools(server));
    tools.area("Tasks and habits", () => registerCapacityTools(server));
    tools.area("Undo mistakes", () => registerUndoTools(server));
    tools.area("Goals and needs", () => registerItemTools(server));
    tools.area("Learning", () => registerLearningTools(server));
    tools.area("Coaching", () => registerSlipTools(server));
    tools.area("Coaching", () => registerModeTools(server));
    tools.area("Where I am", () => registerStatusTools(server));
    tools.area("Money", () => registerMoneyTools(server));
    tools.area("Money", () => registerGuardrailTools(server));
    tools.area("Stats", () => registerStatsTools(server));
    tools.area("Memory", () => registerMemoryTools(server));
    tools.area("Who I'm becoming", () => registerIdentityTools(server));
    tools.area("Workouts", () => registerWorkoutTools(server));
    tools.area("Pantry and meals", () => registerPantryTools(server));
    tools.area("Pantry and meals", () => registerMealTools(server));
    tools.area("Events", () => registerEventTools(server));
    tools.area("Planning", () => registerPlanningTools(server));
    tools.area("Close out the day and backups", () => registerCloseOutTools(server));
    tools.area("Settings", () => registerSettingsTools(server));
    tools.area("Applications", () => registerApplicationTools(server));
    tools.area("Updates owed", () => registerUpdateTools(server));
    tools.area("Google Calendar", () => registerCalendarTools(server));
    tools.area("Fun", () => registerFunTools(server));
    tools.area("School", () => registerCourseTools(server));
    tools.area("Jobs, roles and teams", () => registerCommitmentTools(server));
    tools.area("Promises", () => registerPromiseTools(server));
    tools.area("Settings", () => registerProfileTools(server));
    tools.area("People", () => registerPeopleTools(server));
    tools.area("About me", () => registerSelfTools(server));
    tools.area("Library and favourites", () => registerLibraryTools(server));
    tools.area("Lists", () => registerListTools(server));
    tools.area("Reviews and themes", () => registerReviewTools(server));
    tools.area("Achievements", () => registerAchievementTools(server));
    tools.area("Routines", () => registerRoutineTools(server));
    tools.area("Decisions", () => registerDecisionTools(server));
    tools.area("Values", () => registerValuesTools(server));
    tools.area("Trends and experiments", () => registerMetricsTools(server));
    registerHelpTool(server, tools.entries);
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
      "time zone, currency or voice (update_profile). Money is whole units of their currency. MyPaddie has tools for a " +
      "lot more than tasks — courses, timetables and study plans, people and who to reach out to, notes about themselves " +
      "(patterns, triggers, habits, what they're healing from), their library and favourite things, their own lists " +
      "(bucket list, anything), weekly/monthly/quarterly/yearly reviews, year and month themes, achievements, " +
      "routines, a decision log, their values, trends (sleep, mood, screen time, spending…) and personal experiments, " +
      "check-ins with sleep, mood and screen time, promises, jobs and " +
      "roles (with history), fun, workouts, pantry, events, applications, updates owed, Google Calendar. Before telling them it can't do something, check your " +
      "tools or call what_can_paddie_do. If a tool says their plan doesn't include something, tell them exactly that.",
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
