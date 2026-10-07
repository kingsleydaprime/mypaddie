import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { upcoming } from "@/features/events/events";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { syncCalendar } from "@/features/calendar/calendar.repo";
import { loadFunPicture } from "@/features/fun/fun.repo";
import { loadActiveIdentity } from "@/features/identity/identity.repo";
import { loadLearning } from "@/features/learning/learning.repo";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { loadMode } from "@/features/mode/mode.repo";
import { loadMoneyStage } from "@/features/money/money.repo";
import type { MoneyStage } from "@/features/money/stage";
import { roomOn } from "@/features/tasks/capacity";
import { catchUp, loadCapacity, loadDayTasks, loadTasksAroundToday } from "@/features/tasks/tasks.repo";
import { DEFAULT_CONFIG } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { dayKey, formatLocal } from "@/shared/time";
import { pickFocus, type FocusItem } from "./focus";

const tz = DEFAULT_CONFIG.timeZone;

const item = (i: FocusItem) => ({
  id: i.id,
  title: i.title,
  due: i.dueAt ? formatLocal(i.dueAt, tz) : null,
  overdue: i.overdue,
  nonNegotiable: i.nonNegotiable,
});

function moneySummary(m: MoneyStage) {
  if (m.stage === "audit") return { stage: m.stage, auditDay: m.day, daysLeft: m.daysLeft };
  return {
    stage: m.stage,
    income: m.totals.income,
    needs: m.totals.needs,
    wants: m.totals.wants,
    gap: Math.max(0, m.totals.gap),
    measuredDays: m.measured,
    topLeaks: m.topLeaks,
  };
}

export function registerTodayTools(server: McpServer) {
  server.registerTool(
    "get_today",
    {
      title: "Get today",
      description:
        "Call at the start of every chat. Returns the 3 things that matter right now (lead with these and ask Kingsley " +
        "to do one), the rest of today's open tasks, money status, the current coaching mode with the facts " +
        "behind it, and his 'Who I'm becoming' profile (`becoming`) — measure choices against it all chat. Follow the returned mode. Don't recite stats unless asked.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const caughtUp = await catchUp(db, now);
        // Keep imported Google Calendar events fresh (at most every 30 minutes; failures are recorded, not thrown).
        await syncCalendar(db, now).catch(() => null);
        const [tasks, mode, money, capacity, dayTasks, identity, events, learning, schedule, fun] = await Promise.all([
          loadTasksAroundToday(db, now),
          loadMode(db, now),
          loadMoneyStage(db, now),
          loadCapacity(db),
          loadDayTasks(db, dayKey(now, tz)),
          loadActiveIdentity(db),
          loadUpcomingEvents(db),
          loadLearning(db, now),
          loadSchedule(db),
          loadFunPicture(db, now),
        ]);
        const soon = upcoming(events, now, schedule.eventCloseDays, undefined, schedule.eventCloseDays);
        const room = roomOn(dayKey(now, tz), dayTasks, capacity, now, undefined, dayEndsAt(schedule));
        const focus = pickFocus(tasks, now);
        // Fun counts: suggest some once today's quests are done, or when it's been too long.
        const funDue = fun.daysSinceFun !== null && schedule.funEveryDays > 0 && fun.daysSinceFun >= schedule.funEveryDays;
        const questsDone = focus.top.length === 0 && focus.rest.length === 0 && focus.doneToday > 0;
        return ok({
          now: formatLocal(now, tz),
          mode,
          focus: focus.top.map(item),
          rest: focus.rest.map(item),
          doneToday: focus.doneToday,
          money: moneySummary(money),
          // How full today is, in minutes. Mention only if he's near or over, or asks.
          plate: { capacity: room.capacity, committed: room.committed, available: room.available, label: room.label },
          caughtUp,
          // Topics due for review (spaced repetition). Offer one as a short practice, don't list them all.
          reviewDue: learning
            .filter((l) => l.skill.status === "active")
            .flatMap((l) => l.summary.reviewDue.map((t) => ({ skill: l.skill.name, topic: t.topic, confidence: t.confidence })))
            .slice(0, 5),
          // Today's events, and important ones within the week (prepare for those).
          events: {
            today: soon.filter((e) => e.daysAway === 0).map((e) => ({ title: e.title, kind: e.kind, at: e.allDay ? "all day" : formatLocal(e.at, tz) })),
            prepareNow: soon.filter((e) => e.daysAway > 0 && e.quadrant === "prepare_now").map((e) => ({ title: e.title, daysAway: e.daysAway })),
          },
          // Days since any fun (null = no fun list yet: offer to start one). `ideas` only when he's earned a break or is overdue for one.
          fun: {
            daysSince: fun.daysSinceFun,
            ...(funDue || questsDone ? { ideas: fun.suggestions.map((f) => f.title), why: questsDone ? "quests_done" : "overdue" } : {}),
          },
          // Who he's becoming — coach toward it all chat. Null: offer to help him write one.
          becoming: identity ? { name: identity.name, text: identity.text } : null,
        });
      } catch (error) {
        return toolError(`get_today failed: ${(error as Error).message}`);
      }
    },
  );
}
