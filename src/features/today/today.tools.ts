import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { upcoming } from "@/features/events/events";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { loadActiveIdentity } from "@/features/identity/identity.repo";
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
        const [tasks, mode, money, capacity, dayTasks, identity, events] = await Promise.all([
          loadTasksAroundToday(db, now),
          loadMode(db, now),
          loadMoneyStage(db, now),
          loadCapacity(db),
          loadDayTasks(db, dayKey(now, tz)),
          loadActiveIdentity(db),
          loadUpcomingEvents(db),
        ]);
        const soon = upcoming(events, now, 7);
        const room = roomOn(dayKey(now, tz), dayTasks, capacity, now);
        const focus = pickFocus(tasks, now);
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
          // Today's events, and important ones within the week (prepare for those).
          events: {
            today: soon.filter((e) => e.daysAway === 0).map((e) => ({ title: e.title, kind: e.kind, at: e.allDay ? "all day" : formatLocal(e.at, tz) })),
            prepareNow: soon.filter((e) => e.daysAway > 0 && e.quadrant === "prepare_now").map((e) => ({ title: e.title, daysAway: e.daysAway })),
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
