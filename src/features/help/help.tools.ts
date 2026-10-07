import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FEATURE_LABEL, limitText, LIMITED, PLAN_INFO } from "@/features/plans/plans";
import { ok, toolError } from "@/shared/mcp/kit";
import { currentPlan } from "@/shared/user-context";

export interface ToolEntry {
  name: string;
  title: string;
  description: string;
  area: string;
}

/**
 * Wraps registration so every tool is recorded as it's added, grouped under
 * the area that registered it. `what_can_paddie_do` lists exactly what this
 * server has — nothing to keep in sync by hand.
 */
export function catalogue(server: McpServer) {
  const entries: ToolEntry[] = [];
  let area = "General";
  const original = server.registerTool.bind(server);
  (server as unknown as { registerTool: (name: string, config: { title?: string; description?: string }, ...rest: unknown[]) => unknown }).registerTool = (name, config, ...rest) => {
    entries.push({ name, title: config.title ?? name, description: config.description ?? "", area });
    return (original as (...a: unknown[]) => unknown)(name, config, ...rest);
  };
  return {
    area<T>(label: string, register: () => T): T {
      area = label;
      return register();
    },
    entries,
  };
}

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim().slice(0, 200);

export function registerHelpTool(server: McpServer, entries: readonly ToolEntry[]) {
  server.registerTool(
    "what_can_paddie_do",
    {
      title: "What can Paddie do",
      description:
        "Lists every MyPaddie tool, grouped by area, with what the user's plan includes. Call this BEFORE telling them " +
        "MyPaddie can't do something, or when they ask what it can do — the answer is often yes (courses, promises, " +
        "commitments and role history, fun, workouts, pantry, applications, updates, calendar, money, study plans…).",
      inputSchema: z.object({ area: z.string().trim().optional().describe("Only this area, e.g. 'Money' or 'School'") }),
      annotations: { readOnlyHint: true },
    },
    async ({ area }: { area?: string }) => {
      try {
        const want = area?.toLowerCase();
        const groups = new Map<string, { tool: string; does: string }[]>();
        for (const e of entries) {
          if (e.name === "what_can_paddie_do") continue;
          if (want && !e.area.toLowerCase().includes(want)) continue;
          groups.set(e.area, [...(groups.get(e.area) ?? []), { tool: e.name, does: firstSentence(e.description) }]);
        }
        const plan = PLAN_INFO[currentPlan().plan];
        return ok({
          areas: [...groups].map(([name, tools]) => ({ area: name, tools })),
          plan: {
            name: plan.name,
            limits: LIMITED.map((l) => limitText(l, plan.limits[l])),
            includes: plan.features.filter((f) => !plan.comingSoon?.includes(f)).map((f) => FEATURE_LABEL[f]),
            note: "Anything over a limit or outside the plan returns a message saying so — relay it; they can switch plans in Settings → Plan (free during early access).",
          },
        });
      } catch (error) {
        return toolError(`what_can_paddie_do failed: ${(error as Error).message}`);
      }
    },
  );
}
