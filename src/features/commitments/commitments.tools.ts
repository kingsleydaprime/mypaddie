import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { PILLARS } from "@/shared/domain";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { COMMITMENT_KINDS, COMMITMENT_PRIORITIES, COMMITMENT_STATUSES, type CommitmentKind, type CommitmentPriority, type CommitmentStatus, type WeekLoad } from "./commitments";
import { addCommitment, addSession, commitmentLabel, findCommitment, loadCommitments, loadWeekLoad, updateCommitment, type SessionInput } from "./commitments.repo";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const session = z.object({
  title: z.string().trim().min(1).max(200).describe("e.g. 'Team training', 'Personal training', 'Choir rehearsal', 'Shift'"),
  recurrence: z.string().describe("FREQ=DAILY or FREQ=WEEKLY;BYDAY=TU,TH"),
  time: time.optional().describe("Start time; omit for any time that day"),
  minutes: z.number().int().min(5).max(720),
  start_date: z.iso.date().optional(),
  weights: z.array(z.object({ pillar: z.enum(PILLARS), weight: z.number().int().min(1).max(100) })).optional().describe("Override the default pillars (e.g. choir → spiritual)"),
});
type SessionArg = z.infer<typeof session>;
const toSession = (s: SessionArg): SessionInput => ({ title: s.title, recurrence: s.recurrence, time: s.time, minutes: s.minutes, startDate: s.start_date, weights: s.weights });

const hours = (m: number) => Math.round((m / 60) * 10) / 10;
/** The load in hours, which is how people talk about a week. */
const loadView = (w: WeekLoad) => ({
  verdict: w.verdict,
  percentOfCapacity: Math.round(w.ratio * 100),
  hours: { capacity: hours(w.capacity), scheduled: hours(w.scheduled), unscheduled: hours(w.extra), total: hours(w.total) },
  byCommitment: w.byCommitment.map((c) => ({ title: c.title, priority: c.priority, hoursPerWeek: hours(c.minutes) })),
  everythingElseHours: hours(w.other),
  ...(w.after ? { ifAdded: { addingHours: hours(w.after.adding), percentOfCapacity: Math.round(w.after.ratio * 100), verdict: w.after.verdict } } : {}),
  ...(w.dropCandidates.length ? { dropCandidates: w.dropCandidates.map((d) => ({ title: d.title, priority: d.priority, frees: hours(d.minutes), enough: d.enough })) } : {}),
});

const ADVICE =
  "If the verdict is tight or overloaded, say plainly that his plate is full. Advise — he decides: suggest dropping or " +
  "pausing from dropCandidates (optional ones first; `enough` marks where dropping gets him back to room) and weigh them " +
  "against his 'Who I'm becoming' profile — keep what serves it. Never suggest dropping a core commitment.";

export function registerCommitmentTools(server: McpServer) {
  server.registerTool(
    "check_load",
    {
      title: "Check load",
      description:
        "How full his week is: the next 7 days against their capacity, plus unscheduled hours from his jobs and roles. " +
        "Call it BEFORE he takes on anything sizeable — a new job, role, club, team, big goal, regular commitment — " +
        `passing adding_hours_per_week. ${ADVICE}`,
      inputSchema: z.object({ adding_hours_per_week: z.number().min(0).max(100).optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ adding_hours_per_week }: { adding_hours_per_week?: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const load = await loadWeekLoad(db, now, adding_hours_per_week === undefined ? undefined : Math.round(adding_hours_per_week * 60));
        return ok(await withMode(db, now, { load: loadView(load) }));
      } catch (error) {
        return toolError(`check_load failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "add_commitment",
    {
      title: "Add commitment",
      description:
        "A job (full-time, part-time, freelance, internship), role (volunteer, campus ambassador, academic lead), " +
        "membership (a union, association, church unit like the choir) or team (school ball team). Priority: core " +
        "(non-negotiable, like his main job), important, or optional. Regular sessions (team training Tue/Thu 16:00, " +
        "rehearsals, shifts, personal training) become recurring tasks tied to it; unscheduled time (freelance work, " +
        "admin) goes in extra_hours_per_week. One-offs (a competition, an election, a meeting) are add_event with " +
        "`commitment`. For a competition, also offer extra personal training before it (add_task with `commitment`). " +
        `Run check_load first for anything new. The result includes the week's load after adding. ${ADVICE}`,
      inputSchema: z.object({
        kind: z.enum(COMMITMENT_KINDS),
        title: z.string().trim().min(1).max(120).describe("His role: 'Campus ambassador', 'Striker', 'Backend engineer', 'Member'"),
        org: z.string().trim().max(120).optional().describe("'Igbo Students Union', 'Church choir', 'Acme Ltd'"),
        priority: z.enum(COMMITMENT_PRIORITIES).default("important"),
        starts_on: z.iso.date().optional(),
        ends_on: z.iso.date().optional(),
        extra_hours_per_week: z.number().min(0).max(100).optional(),
        notes: z.string().trim().max(1000).optional(),
        sessions: z.array(session).default([]),
      }),
    },
    async (
      args: {
        kind: CommitmentKind; title: string; org?: string; priority: CommitmentPriority; starts_on?: string; ends_on?: string;
        extra_hours_per_week?: number; notes?: string; sessions: SessionArg[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { commitment, sessions } = await addCommitment(
          db,
          {
            kind: args.kind, title: args.title, org: args.org, priority: args.priority, startsOn: args.starts_on, endsOn: args.ends_on,
            extraMinutesPerWeek: args.extra_hours_per_week ? Math.round(args.extra_hours_per_week * 60) : 0,
            notes: args.notes, sessions: args.sessions.map(toSession),
          },
          now,
        );
        return ok(await withMode(db, now, { id: commitment.id, commitment: commitmentLabel(commitment), sessions, load: loadView(await loadWeekLoad(db, now)) }));
      } catch (error) {
        return toolError(`add_commitment failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_commitments",
    {
      title: "List commitments",
      description: "His jobs, roles, memberships and teams with priority, status and hours a week, plus the week's load.",
      inputSchema: z.object({ include_ended: z.boolean().default(false) }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_ended }: { include_ended: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const [list, load] = await Promise.all([loadCommitments(db, { includeEnded: include_ended }), loadWeekLoad(db, now)]);
        return ok(
          await withMode(db, now, {
            commitments: list.map((c) => ({
              id: c.id, kind: c.kind, title: c.title, org: c.org, priority: c.priority, status: c.status, startsOn: c.starts_on, endsOn: c.ends_on,
              hoursPerWeek: hours(load.byCommitment.find((b) => b.id === c.id)?.minutes ?? c.extra_minutes_per_week), notes: c.notes,
            })),
            load: loadView(load),
          }),
        );
      } catch (error) {
        return toolError(`list_commitments failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_commitment",
    {
      title: "Update commitment",
      description:
        "Change a commitment (by title, org, or id): details, priority, unscheduled hours, or status. Pausing or ending " +
        "it stops its recurring sessions and cancels its open tasks, so the time comes back (resuming doesn't recreate " +
        "them — add sessions again). `add_sessions` adds regular sessions to it.",
      inputSchema: z.object({
        commitment: z.string().trim().min(1),
        kind: z.enum(COMMITMENT_KINDS).optional(),
        title: z.string().trim().min(1).max(120).optional(),
        org: z.string().trim().max(120).nullable().optional(),
        priority: z.enum(COMMITMENT_PRIORITIES).optional(),
        status: z.enum(COMMITMENT_STATUSES).optional(),
        starts_on: z.iso.date().nullable().optional(),
        ends_on: z.iso.date().nullable().optional(),
        extra_hours_per_week: z.number().min(0).max(100).optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        add_sessions: z.array(session).optional(),
      }),
    },
    async (
      args: {
        commitment: string; kind?: CommitmentKind; title?: string; org?: string | null; priority?: CommitmentPriority; status?: CommitmentStatus;
        starts_on?: string | null; ends_on?: string | null; extra_hours_per_week?: number; notes?: string | null; add_sessions?: SessionArg[];
      },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const result = await updateCommitment(
          db,
          args.commitment,
          {
            kind: args.kind, title: args.title, org: args.org, priority: args.priority, status: args.status, startsOn: args.starts_on, endsOn: args.ends_on,
            extraMinutesPerWeek: args.extra_hours_per_week === undefined ? undefined : Math.round(args.extra_hours_per_week * 60), notes: args.notes,
          },
          now,
        );
        if (result.result === "not_found") return toolError(`update_commitment: no single commitment matches "${args.commitment}" — use its id from list_commitments`);
        const sessions = [];
        if (args.add_sessions?.length) {
          const c = (await findCommitment(db, args.commitment)) ?? (args.title ? await findCommitment(db, args.title) : null);
          for (const s of args.add_sessions) {
            const made = c ? await addSession(db, c, toSession(s), now) : null;
            sessions.push(made?.result === "created" ? { session: s.title, result: "created" } : { session: s.title, ...(made ?? { result: "not_found" }) });
          }
        }
        return ok(await withMode(db, now, { ...result, ...(sessions.length ? { sessions } : {}), load: loadView(await loadWeekLoad(db, now)) }));
      } catch (error) {
        return toolError(`update_commitment failed: ${(error as Error).message}`);
      }
    },
  );
}
