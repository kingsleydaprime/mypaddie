import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { formatLocal } from "@/shared/time";
import { APPLICATION_KINDS, APPLICATION_STATUSES, type ApplicationKind, type ApplicationStatus } from "./applications";
import { addApplication, changeRequirement, loadApplications, updateApplication, type LoadedApplication } from "./applications.repo";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const deadline = z
  .object({
    date: z.iso.date(),
    time: time.default("23:59"),
    time_zone: z.string().min(1).describe("IANA name as published, e.g. America/New_York, Europe/London, Africa/Lagos"),
  })
  .describe("Exactly as published — convert nothing yourself; the server does it, DST included");
const requirement = z.object({ title: z.string().trim().min(1), minutes: z.number().int().min(5).max(1440).optional() });

const view = (a: LoadedApplication) => ({
  id: a.id,
  title: a.title,
  org: a.org,
  kind: a.kind,
  status: a.status,
  link: a.link,
  urgency: a.summary.urgency,
  closesYourTime: a.deadline_at ? formatLocal(new Date(a.deadline_at), tz()) : "rolling",
  closesAsPublished: a.deadline_at && a.deadline_tz ? `${formatLocal(new Date(a.deadline_at), a.deadline_tz)} ${a.deadline_tz}` : null,
  targetDay: a.summary.targetDay,
  daysToTarget: a.summary.daysToTarget,
  progress: a.summary.progress,
  missing: a.summary.missing,
  requirements: a.requirements.map((r) => ({ title: r.title, done: r.done })),
  resultsExpected: a.results_expected,
});

export function registerApplicationTools(server: McpServer) {
  server.registerTool(
    "add_application",
    {
      title: "Add application",
      description:
        "Track something he's applying for — a job, internship, scholarship, fellowship, grant, admission, programme. " +
        "Give the deadline exactly as published, with its time zone (many aren't Lagos time: '23:59 EST' can be the " +
        "next morning here). Omit the deadline if it's rolling. List the requirements (CV, transcript, 2 references, " +
        "essay…): each becomes a task due on the target date (3 days before the deadline by default) that turns " +
        "must-do 2 days before it. Report any requirement that couldn't be scheduled (full day) and offer another day.",
      inputSchema: z.object({
        title: z.string().trim().min(1),
        org: z.string().trim().optional(),
        kind: z.enum(APPLICATION_KINDS),
        link: z.url().optional(),
        description: z.string().optional(),
        deadline: deadline.optional(),
        target_days_before: z.number().int().min(0).max(60).optional(),
        results_expected: z.iso.date().optional(),
        notes: z.string().optional(),
        requirements: z.array(requirement).default([]),
      }),
    },
    async (
      args: {
        title: string; org?: string; kind: ApplicationKind; link?: string; description?: string;
        deadline?: { date: string; time: string; time_zone: string }; target_days_before?: number; results_expected?: string; notes?: string;
        requirements: { title: string; minutes?: number }[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const created = await addApplication(
          db,
          {
            ...args,
            deadline: args.deadline ? { date: args.deadline.date, time: args.deadline.time, timeZone: args.deadline.time_zone } : undefined,
            targetDaysBefore: args.target_days_before,
            resultsExpected: args.results_expected,
          },
          now,
        );
        const app = (await loadApplications(db, now)).find((a) => a.id === created.id)!;
        return ok(await withMode(db, now, { application: view(app), scheduling: created.scheduling }));
      } catch (error) {
        return toolError(`add_application failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_applications",
    {
      title: "List applications",
      description:
        "Everything he's applying for, with urgency (past_target, due_soon, upcoming, rolling, closed, done), the " +
        "deadline in his time and as published, days to his target date, and what's still missing. Use for " +
        "'what's due this month?' and 'what am I missing?'.",
      inputSchema: z.object({ include_finished: z.boolean().default(false).describe("Include submitted/closed ones") }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_finished }: { include_finished: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const apps = (await loadApplications(db, now)).filter((a) => include_finished || a.summary.urgency !== "done");
        return ok(await withMode(db, now, { applications: apps.map(view) }));
      } catch (error) {
        return toolError(`list_applications failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_application",
    {
      title: "Update application",
      description:
        "Move it through the pipeline (researching → preparing → submitted → interview → offer/rejected/withdrawn) " +
        "or change its details. Submitting cancels any requirement tasks still open. A new deadline or target " +
        "moves the open requirement tasks with it. Celebrate a submission; be steady about a rejection.",
      inputSchema: z.object({
        id: z.uuid(),
        status: z.enum(APPLICATION_STATUSES).optional(),
        title: z.string().trim().min(1).optional(),
        org: z.string().trim().nullable().optional(),
        link: z.url().nullable().optional(),
        description: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        deadline: deadline.nullable().optional().describe("null = make it rolling"),
        target_days_before: z.number().int().min(0).max(60).optional(),
        results_expected: z.iso.date().nullable().optional(),
      }),
    },
    async (
      args: {
        id: string; status?: ApplicationStatus; title?: string; org?: string | null; link?: string | null; description?: string | null; notes?: string | null;
        deadline?: { date: string; time: string; time_zone: string } | null; target_days_before?: number; results_expected?: string | null;
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const outcome = await updateApplication(
          db,
          args.id,
          {
            status: args.status, title: args.title, org: args.org, link: args.link, description: args.description, notes: args.notes,
            deadline: args.deadline === undefined ? undefined : args.deadline ? { date: args.deadline.date, time: args.deadline.time, timeZone: args.deadline.time_zone } : null,
            targetDaysBefore: args.target_days_before,
            resultsExpected: args.results_expected,
          },
          now,
        );
        return ok(await withMode(db, now, { ...outcome }));
      } catch (error) {
        return toolError(`update_application failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_requirement",
    {
      title: "Update requirement",
      description:
        "An application's checklist: add requirements (each becomes a task), tick one done (completes its task, " +
        "paying XP), untick, or remove one. Match requirements by title.",
      inputSchema: z.object({
        application_id: z.uuid(),
        add: z.array(requirement).optional(),
        done: z.string().trim().min(1).optional(),
        undone: z.string().trim().min(1).optional(),
        remove: z.string().trim().min(1).optional(),
      }),
    },
    async (args: { application_id: string; add?: { title: string; minutes?: number }[]; done?: string; undone?: string; remove?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await changeRequirement(db, args.application_id, args, now)) }));
      } catch (error) {
        return toolError(`update_requirement failed: ${(error as Error).message}`);
      }
    },
  );
}
