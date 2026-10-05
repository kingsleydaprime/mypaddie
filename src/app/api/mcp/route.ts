import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerApplicationTools } from "@/features/applications/applications.tools";
import { registerCalendarTools } from "@/features/calendar/calendar.tools";
import { registerEventTools } from "@/features/events/events.tools";
import { registerIdentityTools } from "@/features/identity/identity.tools";
import { registerItemTools } from "@/features/items/items.tools";
import { registerLearningTools } from "@/features/learning/learning.tools";
import { registerMemoryTools } from "@/features/memory/memory.tools";
import { registerModeTools } from "@/features/mode/mode.tools";
import { registerPantryTools } from "@/features/pantry/pantry.tools";
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
import { verifyToken } from "@/shared/mcp/auth";

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
  },
  {
    serverInfo: { name: "mypaddie", version: "1.0.0" },
    instructions:
      "MyPaddie is Kingsley's private life coach. Call get_today first in every chat. Every tool result includes " +
      "`mode` (curious, strict, soft, strictest, softest) with the facts behind it — set your tone from it. get_today also returns `becoming`, his " +
      "'Who I'm becoming' profile: praise choices that fit it, push back on ones that don't, and never debate " +
      "whether it's the right one. He can ask you to edit it (update_identity).",
  },
);

// No token, a bad token, or an expired one → 401 pointing Claude at the login flow.
const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authed as GET, authed as POST, authed as DELETE };
