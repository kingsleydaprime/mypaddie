import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { METRICS, type Metric } from "./metrics";
import { CONCLUSIONS, finishExperiment, loadExperiments, loadTrends, startExperiment, type Conclusion } from "./metrics.repo";

export function registerMetricsTools(server: McpServer) {
  server.registerTool(
    "get_trends",
    {
      title: "Trends",
      description:
        "Weekly lines for sleep, energy, mood, screen time, exercise, learning, spending and promises kept, and which " +
        "way each is heading (last 2 weeks against the 4 before; `good` says whether that's the better way). Use it " +
        "for reviews and for 'how have I been?' — point out what moved, and connect lines only as a guess, never as fact.",
      inputSchema: z.object({ weeks: z.number().int().min(4).max(52).optional(), metric: z.enum(METRICS).optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ weeks, metric }: { weeks?: number; metric?: Metric }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { trends: await loadTrends(db, now, weeks ?? 8, metric) }));
      } catch (error) {
        return toolError(`get_trends failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "start_experiment",
    {
      title: "Start an experiment",
      description:
        "A small personal experiment: change one thing for a while and see what happens ('no phone after 10pm for 2 " +
        "weeks — does my sleep improve?'). `metric` is the line to watch (" + METRICS.join(", ") + ") or omit it for " +
        "one judged by feel. Adds an 'Experiment ends' task on the last day. Default 14 days.",
      inputSchema: z.object({
        change: z.string().trim().min(1).max(200),
        question: z.string().trim().max(300).optional(),
        metric: z.enum(METRICS).optional(),
        days: z.number().int().min(3).max(90).optional(),
        starts_on: z.iso.date().optional(),
      }),
    },
    async (args: { change: string; question?: string; metric?: Metric; days?: number; starts_on?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await startExperiment(db, { ...args, startsOn: args.starts_on }, now)) }));
      } catch (error) {
        return toolError(`start_experiment failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_experiments",
    {
      title: "Experiments",
      description:
        "Their experiments, running and finished. With a metric, `comparison` holds the average before vs during " +
        "(`enoughData` false = too few days logged to say). `due` = it's ended: ask how it went, show the numbers, then finish_experiment.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_a: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { experiments: await loadExperiments(db, now) }));
      } catch (error) {
        return toolError(`list_experiments failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "finish_experiment",
    {
      title: "Finish an experiment",
      description:
        "The verdict (id from list_experiments): helped, no_difference, made_worse or unclear, and what they found. " +
        "`save_pattern` keeps the finding in About me as a pattern ('I sleep better with no phone after 10pm') — offer it " +
        "when something helped. `abandon` stops one that didn't happen.",
      inputSchema: z.object({
        id: z.uuid(),
        conclusion: z.enum(CONCLUSIONS).optional(),
        result: z.string().trim().max(1000).optional(),
        save_pattern: z.string().trim().max(200).optional(),
        abandon: z.boolean().optional(),
      }),
    },
    async (args: { id: string; conclusion?: Conclusion; result?: string; save_pattern?: string; abandon?: boolean }, ctx: ToolContext) => {
      try {
        if (!args.abandon && !args.conclusion) return toolError("finish_experiment needs a conclusion (or abandon: true).");
        const db = dbFrom(ctx);
        const now = new Date();
        const done = await finishExperiment(db, args.id, { conclusion: args.conclusion ?? "unclear", result: args.result, savePattern: args.save_pattern, abandon: args.abandon }, now);
        if (done.result === "not_found") return toolError("No experiment with that id — check list_experiments.");
        return ok(await withMode(db, now, { ...done }));
      } catch (error) {
        return toolError(`finish_experiment failed: ${(error as Error).message}`);
      }
    },
  );
}
