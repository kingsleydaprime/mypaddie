import { upcoming } from "@/features/events/events";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { loadBills } from "@/features/money/guardrails.repo";
import { loadCheckin } from "@/features/metrics/metrics.repo";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { recordSlip } from "@/features/slips/slips.repo";
import { roomOn } from "@/features/tasks/capacity";
import { loadCapacity, loadDayTasks, updateTask } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, localTimeOf, zonedInstant } from "@/shared/time";
import { checkDecision, closeOutXp, dayRead, reasonAccepted, sweep, type Decision, type OpenTask } from "./closeout";

const tz = () => currentConfig().timeZone;

/** Everything the close-out needs: what's open, what got done, and tomorrow. */
export async function loadCloseOut(db: Db, now: Date) {
  const today = dayKey(now, tz());
  const tomorrow = addDays(today, 1);
  const endOfToday = zonedInstant(tomorrow, "00:00", tz()).toISOString();
  const startOfToday = zonedInstant(today, "00:00", tz()).toISOString();

  const [open, done, closed, tomorrowTasks, capacity, events, bills, checkin, schedule] = await Promise.all([
    db
      .from("tasks")
      .select("id, title, due_at, occurs_on, status, series_id, items(tier)")
      .eq("status", "pending")
      .or(`due_at.lt.${endOfToday},and(due_at.is.null,occurs_on.lte.${today})`),
    db.from("tasks").select("title").eq("status", "done").gte("done_at", startOfToday).lt("done_at", endOfToday),
    db.from("day_closes").select("win, note, closed_at").eq("day", today).maybeSingle(),
    loadDayTasks(db, tomorrow),
    loadCapacity(db),
    loadUpcomingEvents(db),
    loadBills(db, now),
    loadCheckin(db, today),
    loadSchedule(db),
  ]);
  if (open.error) throw new Error(`loading open tasks: ${open.error.message}`);
  if (done.error) throw new Error(`loading done tasks: ${done.error.message}`);

  const tasks: OpenTask[] = open.data.map((t) => ({
    id: t.id,
    title: t.title,
    day: t.due_at ? dayKey(new Date(t.due_at), tz()) : t.occurs_on,
    isNeed: (t.items as { tier: string } | null)?.tier === "need",
    isHabit: t.series_id !== null,
    status: t.status as "pending",
  }));
  const unfinished = sweep(tasks, today);
  const room = roomOn(tomorrow, tomorrowTasks, capacity, now, undefined, dayEndsAt(schedule));

  return {
    today,
    alreadyClosed: closed.data ?? null,
    read: dayRead(done.data.length, unfinished),
    done: done.data.map((t) => t.title),
    unfinished: unfinished.map((t) => ({ id: t.id, title: t.title, due: t.day, overdueDays: t.overdueDays, need: t.isNeed, habit: t.isHabit, options: t.options })),
    checkin: { logged: checkin !== null, missing: (["energy", "mood", "sleep_hours"] as const).filter((k) => checkin?.[k] == null) },
    tomorrow: {
      day: tomorrow,
      tasks: tomorrowTasks
        .filter((t) => t.status === "pending")
        .map((t) => ({ title: t.title, at: t.dueAt && localTimeOf(t.dueAt, tz()) !== "23:59" ? localTimeOf(t.dueAt, tz()) : null })),
      events: upcoming(events, now, 1).filter((e) => dayKey(e.at, tz()) === tomorrow).map((e) => ({ title: e.title, at: e.allDay ? null : localTimeOf(e.at, tz()) })),
      bills: bills.bills.filter((b) => b.status === "active" && b.nextDue === tomorrow).map((b) => ({ title: b.title, amount: b.amount })),
      room: { capacityMinutes: room.capacity, committedMinutes: room.committed, freeMinutes: room.available },
    },
  };
}

export type CloseDecision = Decision & { taskId: string; accepts?: boolean };

/**
 * Apply decisions on open tasks. Each is checked on its own and the results
 * come back per task — one refusal (a clash on the day it's moved to) doesn't
 * undo the rest.
 */
export async function applyDecisions(db: Db, decisions: CloseDecision[], now: Date) {
  const today = dayKey(now, tz());
  const input = { decisions };
  const { data: rows, error } = await db
    .from("tasks")
    .select("id, title, status, series_id, items(tier)")
    .in("id", input.decisions.map((d) => d.taskId));
  if (error) throw new Error(`loading the tasks: ${error.message}`);

  const results: { task: string; decision: Decision["kind"]; result: string; detail?: unknown }[] = [];
  const counts = { moved: 0, dropped: 0, slipped: 0 };
  for (const d of input.decisions) {
    const row = rows.find((r) => r.id === d.taskId);
    if (!row || row.status !== "pending") {
      results.push({ task: row?.title ?? d.taskId, decision: d.kind, result: row ? `already ${row.status}` : "not_found" });
      continue;
    }
    const shape = { isNeed: (row.items as { tier: string } | null)?.tier === "need", isHabit: row.series_id !== null };
    const check = checkDecision(shape, d, today);
    if (!check.ok) {
      results.push({ task: row.title, decision: d.kind, result: check.reason });
      continue;
    }
    if (d.kind === "move") {
      const res = await updateTask(db, row.id, { dueDate: d.to }, "edit", now);
      results.push({ task: row.title, decision: "move", result: res.result, ...(res.result === "updated" ? {} : { detail: res }) });
      if (res.result === "updated") counts.moved += 1;
    } else if (d.kind === "drop") {
      const res = await updateTask(db, row.id, {}, "cancel", now);
      results.push({ task: row.title, decision: "drop", result: res.result });
      if (res.result === "cancelled") counts.dropped += 1;
    } else {
      const res = await recordSlip(db, { taskId: row.id, why: d.why, category: d.category, accepts: d.accepts ?? reasonAccepted(d.category) }, now);
      results.push({ task: row.title, decision: "slipped", result: res.result, ...(res.result === "recorded" ? { detail: res.verdict } : {}) });
      if (res.result === "recorded") counts.slipped += 1;
    }
  }

  return { results, counts };
}

/** Record the close (win, note, what was decided) and pay for the habit once a day. */
export async function closeDay(db: Db, input: { win?: string | null; note?: string | null; counts?: Record<string, number> }, now: Date) {
  const today = dayKey(now, tz());
  const { data, error: closeError } = await db.rpc("close_day", {
    p_day: today,
    p_win: (input.win ?? null) as string,
    p_note: (input.note ?? null) as string,
    p_summary: (input.counts ?? {}) as unknown as Json,
    p_xp: closeOutXp() as unknown as Json,
  });
  if (closeError) throw new Error(`closing the day: ${closeError.message}`);
  const closed = (data as { result: "closed" | "updated" }).result;
  return { day: today, result: closed, xp: closed === "closed" ? closeOutXp().reduce((s, e) => s + e.amount, 0) : 0 };
}

/** Apply tonight's decisions, then close the day. */
export async function closeOut(db: Db, input: { decisions: CloseDecision[]; win?: string | null; note?: string | null }, now: Date) {
  const { results, counts } = await applyDecisions(db, input.decisions, now);
  return { ...(await closeDay(db, { win: input.win, note: input.note, counts }, now)), decisions: results };
}
