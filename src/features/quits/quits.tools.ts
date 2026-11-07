import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, formatLocal, zonedInstant } from "@/shared/time";
import { aiLabel, MILESTONES, privateLabel, QuitRuleError, type QuitKind } from "./quits";
import { loadQuit, loadQuits, logQuit, setQuitCap, setQuitStatus, startQuit, updateQuitDetails, type Quit, type QuitStatus } from "./quits.repo";

/*
 * Privacy (D5): Paddie sees a quit's alias, or "a habit you're quitting". The
 * real name, and the why (which often names it), only when the user turned on
 * show_name_to_ai for that quit. Notes are never returned: they're written for
 * the user, and may name it too.
 */

const tz = () => currentConfig().timeZone;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const when = z.object({ date: z.iso.date(), time: time.optional() });
const KIND = { quit: "quit", cut_down: "limit" } as const;
const kindOut = (k: QuitKind) => (k === "limit" ? "cut_down" : "quit");
const milestoneXp = (days: number) => MILESTONES.find((m) => m.days === days)?.xp ?? 0;

/** A local date (and time) in the user's zone; a date alone is that day's midnight, or now if it's today. */
function localWhen(w: { date: string; time?: string } | undefined, now: Date): Date | null {
  if (!w) return null;
  if (!w.time && w.date === dayKey(now, tz())) return null;
  return zonedInstant(w.date, w.time ?? "00:00", tz());
}

/** How Paddie sees one quit. */
export function quitView(q: Quit, paid: readonly number[] = []) {
  const p = q.progress;
  return {
    id: q.id,
    name: aiLabel(q),
    ...(q.showNameToAi ? {} : { realNameHidden: true }),
    kind: kindOut(q.kind),
    status: q.status,
    ...(q.kind === "limit" ? { cap: { perDay: q.limitPerDay, unit: q.unit } } : {}),
    daysClean: q.status === "active" ? p.currentDays : null,
    longestDays: p.longestDays,
    totalCleanDays: p.totalCleanDays,
    ...(p.today && q.status === "active" ? { today: p.today } : {}),
    ...(q.nextMilestone ? { nextMilestone: q.nextMilestone } : {}),
    // What recent slips share. Say one plainly, once, as something to plan around, not a verdict.
    ...(q.patterns.length ? { patterns: q.patterns.map((p) => p.text) } : {}),
    ...(q.showNameToAi && q.why ? { why: q.why } : {}),
    onHome: q.onHome,
    ...(paid.length ? { milestonesJustPaid: paid.map((d) => ({ day: d, xp: milestoneXp(d) })) } : {}),
  };
}

const fail = (tool: string, e: unknown) =>
  toolError(e instanceof QuitRuleError ? e.message : `${tool} failed: ${(e as Error).message}`);

export function registerQuitTools(server: McpServer) {
  server.registerTool(
    "get_quits",
    {
      title: "Get quits",
      description:
        "Habits the user is quitting or cutting down: days clean, their best, total clean days, the next milestone, " +
        "and for cutting down today's usage against the cap. Each has a `name`: the private name they chose, or 'a " +
        "habit you're quitting' — use exactly that; the real name is only there if they let you see it. Milestones " +
        "(1, 3, 7, 14, 30, 60, 90, 180, 365 days) pay XP on every attempt; `milestonesJustPaid` means one was reached " +
        "since they last looked: celebrate it, briefly. Never bring a quit up unprompted, except on a milestone day.",
      inputSchema: z.object({}),
      annotations: { idempotentHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const quits = await loadQuits(db, now);
        return ok(await withMode(db, now, { quits: quits.map(({ quit, milestonesPaid }) => quitView(quit, milestonesPaid)) }));
      } catch (error) {
        return fail("get_quits", error);
      }
    },
  );

  server.registerTool(
    "start_quit",
    {
      title: "Start quitting something",
      description:
        "Start a day counter for something they're stopping (kind 'quit': zero is the goal) or cutting down (kind " +
        "'cut_down': stay under a daily cap in minutes or times). Offer a private name (alias, e.g. 'Project P'): the " +
        "app shows it instead, and it's all you'll see afterwards. A slip sends the count to day 0 but never costs XP; " +
        "logging it honestly earns +2. If they stopped earlier ('since Monday'), pass started_on. Free has 1 active; " +
        "over the limit returns a message — relay it.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(80).describe("What it is, in their words"),
        alias: z.string().trim().min(1).max(40).optional().describe("A private name shown instead of the title"),
        kind: z.enum(["quit", "cut_down"]),
        cap: z.number().int().min(1).max(100000).optional().describe("cut_down only: at most this much a day"),
        unit: z.enum(["minutes", "times"]).optional().describe("cut_down only"),
        why: z.string().trim().min(1).max(300).optional().describe("Why they're doing it — shown to them when it's hard"),
        on_home: z.boolean().optional().describe("Show the day count on Home (default off)"),
        started_on: when.optional().describe("When they stopped, if before now"),
      }),
    },
    async (
      args: { title: string; alias?: string; kind: "quit" | "cut_down"; cap?: number; unit?: "minutes" | "times"; why?: string; on_home?: boolean; started_on?: { date: string; time?: string } },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const res = await startQuit(
          db,
          {
            title: args.title,
            alias: args.alias ?? null,
            kind: KIND[args.kind],
            limitPerDay: args.cap ?? null,
            unit: args.unit ?? null,
            why: args.why ?? null,
            onHome: args.on_home ?? false,
            startedAt: localWhen(args.started_on, now),
          },
          now,
        );
        if (res.result === "already_tracking") return toolError("start_quit: they're already tracking that one — use get_quits.");
        const loaded = await loadQuit(db, res.id, now);
        return ok(await withMode(db, now, { quit: loaded ? quitView(loaded.quit, loaded.milestonesPaid) : { id: res.id } }));
      } catch (error) {
        return fail("start_quit", error);
      }
    },
  );

  server.registerTool(
    "update_quit",
    {
      title: "Update a quit",
      description:
        "Change one quit (id from get_quits): its private name, why, whether it shows on Home, the real name, or " +
        "status — 'paused', 'ended', or 'active' to resume or start again. Pausing stops the streak: resuming starts " +
        "from day 0 (their best and total stay), so say that before pausing. For cutting down, a new `cap`: lowering " +
        "it keeps the streak, raising it starts a new attempt — say which. Set show_name_to_ai only when they ask " +
        "you to see the real name (or stop seeing it). Deleting is only in the app.",
      inputSchema: z.object({
        id: z.uuid(),
        alias: z.string().trim().max(40).nullable().optional().describe("Empty or null removes it"),
        why: z.string().trim().max(300).nullable().optional(),
        title: z.string().trim().min(1).max(80).optional(),
        on_home: z.boolean().optional(),
        show_name_to_ai: z.boolean().optional(),
        status: z.enum(["active", "paused", "ended"]).optional(),
        cap: z.number().int().min(1).max(100000).optional(),
      }),
    },
    async (
      args: { id: string; alias?: string | null; why?: string | null; title?: string; on_home?: boolean; show_name_to_ai?: boolean; status?: QuitStatus; cap?: number },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const changes: Record<string, string> = {};
        const details = await updateQuitDetails(db, args.id, {
          title: args.title,
          alias: args.alias,
          why: args.why,
          onHome: args.on_home,
          showNameToAi: args.show_name_to_ai,
        });
        if (details.result === "not_found") return toolError("update_quit failed: no such quit");
        if (details.result === "already_tracking") return toolError("update_quit: another quit already has that name.");
        if (details.result === "updated") changes.details = "updated";
        if (args.cap !== undefined) {
          const cap = await setQuitCap(db, args.id, args.cap, now);
          if (cap.result === "not_found") return toolError("update_quit failed: no such quit");
          changes.cap = cap.result === "raised" ? "raised: a new attempt from day 0" : cap.result === "lowered" ? "lowered: the streak carries on" : "unchanged";
        }
        if (args.status) {
          const st = await setQuitStatus(db, args.id, args.status, now);
          if (st.result === "not_found") return toolError("update_quit failed: no such quit");
          changes.status = st.result;
        }
        const loaded = await loadQuit(db, args.id, now);
        if (!loaded) return toolError("update_quit failed: no such quit");
        return ok(await withMode(db, now, { quit: quitView(loaded.quit, loaded.milestonesPaid), changes }));
      } catch (error) {
        return fail("update_quit", error);
      }
    },
  );

  server.registerTool(
    "log_relapse",
    {
      title: "Log a relapse",
      description:
        "Log a slip on a quit, or usage on a cut-down (with `amount`). It never costs XP; the first log of the day " +
        "earns +2 for honesty. For 'quit' the count goes back to day 0; for 'cut_down' only going over the day's cap " +
        "resets it. Respond firm and kind, in a line or two: no lecture, no shame. Name what was kept (their best, " +
        "their total), and ask for the next clean hour, not a vow. If they sound in real distress, drop the coaching " +
        "and be there for them first. Pass `cause` (e.g. 'bored', 'late night') when they say what set it off. If " +
          "`patternHint` comes back ('4 of your last 5 slips were after midnight'), name it once and ask what would " +
          "help at that time.",
      inputSchema: z.object({
        id: z.uuid(),
        at: when.optional().describe("When it happened, if not just now"),
        amount: z.number().int().min(1).max(100000).optional().describe("cut_down: minutes or times used"),
        cause: z.string().trim().min(1).max(40).optional(),
        note: z.string().trim().min(1).max(500).optional().describe("Their words, kept for them; not shown back to you"),
      }),
    },
    async (args: { id: string; at?: { date: string; time?: string }; amount?: number; cause?: string; note?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const at = localWhen(args.at, now);
        const res = await logQuit(db, args.id, { at, amount: args.amount ?? null, cause: args.cause ?? null, note: args.note ?? null }, now);
        if (res.result === "not_found" || !res.quit) return toolError("log_relapse failed: no such quit");
        const q = res.quit;
        const reset = q.kind === "quit" || q.progress.today?.over === true;
        return ok(
          await withMode(db, now, {
            quit: quitView(q),
            logged: formatLocal(at ?? now, tz()),
            streak: reset ? "reset" : "still going",
            kept: { longestDays: q.progress.longestDays, totalCleanDays: q.progress.totalCleanDays, xp: "all of it" },
            honestyXp: res.honestyXp,
            // The strongest pattern, if there is one: name it and ask what would help at that time.
            ...(q.patterns[0] ? { patternHint: q.patterns[0].text } : {}),
          }),
        );
      } catch (error) {
        return fail("log_relapse", error);
      }
    },
  );
}

/** For get_today: active quits on a milestone day, by private name only. Paddie may mention these unprompted. */
export async function quitMilestonesToday(db: Db, now: Date) {
  const days = new Set(MILESTONES.map((m) => m.days));
  const quits = await loadQuits(db, now);
  return quits
    .filter(({ quit }) => quit.status === "active" && days.has(quit.progress.currentDays))
    .map(({ quit }) => ({ name: privateLabel(quit), day: quit.progress.currentDays }));
}
