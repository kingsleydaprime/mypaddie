import type { McpServer } from "@modelcontextprotocol/server";
import { currentThemes, owedReviews } from "@/features/reviews/reviews.repo";
import { loadDecisions } from "@/features/decisions/decisions.repo";
import { dueExperiments } from "@/features/metrics/metrics.repo";
import { loadValues } from "@/features/values/values.repo";
import { checkAchievements } from "@/features/achievements/achievements.repo";
import { z } from "zod";
import { upcoming } from "@/features/events/events";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { syncCalendar } from "@/features/calendar/calendar.repo";
import { loadWeekLoad } from "@/features/commitments/commitments.repo";
import { loadFunPicture } from "@/features/fun/fun.repo";
import { whoToReachOut } from "@/features/people/people";
import { loadPeople } from "@/features/people/people.repo";
import { loadSelfForAdvice } from "@/features/self/self.repo";
import { applyBrokenPromises, loadPromisePicture } from "@/features/promises/promises.repo";
import { loadActiveIdentity } from "@/features/identity/identity.repo";
import { loadLearning } from "@/features/learning/learning.repo";
import { dayEndsAt } from "@/features/settings/schedule";
import { loadSchedule } from "@/features/settings/settings.repo";
import { loadMode } from "@/features/mode/mode.repo";
import { loadMoneyStage } from "@/features/money/money.repo";
import { mealsForDay } from "@/features/pantry/meals.repo";
import { loadStatus } from "@/features/status/status.repo";
import type { MoneyStage } from "@/features/money/stage";
import { roomOn } from "@/features/tasks/capacity";
import { catchUp, loadCapacity, loadDayTasks, loadTasksAroundToday } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { hasFeature } from "@/features/plans/plans";
import { currentPlan, currentProfile } from "@/shared/user-context";
import { dayKey, formatLocal } from "@/shared/time";
import { pickFocus, type FocusItem } from "./focus";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

const item = (i: FocusItem) => ({
  id: i.id,
  title: i.title,
  due: i.dueAt ? formatLocal(i.dueAt, tz()) : null,
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
        "Call at the start of every chat. Returns the 3 things that matter right now (lead with these and ask the user " +
        "to do one), the rest of today's open tasks, money status, the current coaching mode with the facts " +
        "behind it, and their 'Who I'm becoming' profile (`becoming`) — measure choices against it all chat. Follow the returned mode. Don't recite stats unless asked.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const caughtUp = { ...(await catchUp(db, now)), brokenPromises: await applyBrokenPromises(db, now) };
        // Keep imported Google Calendar events fresh (at most every 30 minutes; failures are recorded, not thrown).
        await syncCalendar(db, now).catch(() => null);
        const [tasks, mode, money, capacity, dayTasks, identity, events, learning, schedule, fun, promises, week, people, self, themes, owed, earned, decisions, values, experimentsDue, mealsToday, status] = await Promise.all([
          loadTasksAroundToday(db, now),
          loadMode(db, now),
          loadMoneyStage(db, now),
          loadCapacity(db),
          loadDayTasks(db, dayKey(now, tz())),
          loadActiveIdentity(db),
          loadUpcomingEvents(db),
          loadLearning(db, now),
          loadSchedule(db),
          loadFunPicture(db, now),
          loadPromisePicture(db, now),
          loadWeekLoad(db, now),
          loadPeople(db),
          loadSelfForAdvice(db),
          currentThemes(db, now),
          owedReviews(db, now),
          checkAchievements(db, now),
          loadDecisions(db, now),
          loadValues(db),
          dueExperiments(db, now),
          mealsForDay(db, dayKey(now, tz())),
          loadStatus(db, now),
        ]);
        const soon = upcoming(events, now, schedule.eventCloseDays, undefined, schedule.eventCloseDays);
        const room = roomOn(dayKey(now, tz()), dayTasks, capacity, now, undefined, dayEndsAt(schedule));
        const focus = pickFocus(tasks, now);
        // Details for the top three only: what they'd read when starting one.
        const { data: detailRows } = focus.top.length
          ? await db.from("tasks").select("id, details").in("id", focus.top.map((f) => f.id)).not("details", "is", null)
          : { data: [] as { id: string; details: string | null }[] };
        const details = new Map((detailRows ?? []).map((d) => [d.id, d.details]));
        // Fun counts: suggest some once today's quests are done, or when it's been too long.
        const funDue = fun.daysSinceFun !== null && schedule.funEveryDays > 0 && fun.daysSinceFun >= schedule.funEveryDays;
        const questsDone = focus.top.length === 0 && focus.rest.length === 0 && focus.doneToday > 0;
        const me = currentProfile();
        return ok({
          // Some AI apps ignore server instructions; this rides along with the first call of every chat.
          tip: "MyPaddie can do far more than this summary shows. Before saying it can't do something, call what_can_paddie_do.",
          // Who you're talking to, and how they want to be talked to.
          you: { name: me.displayName, voice: me.voice, timeZone: me.timeZone, currency: me.currency, ...(me.onboardedAt ? {} : { setUp: false }) },
          now: formatLocal(now, tz()),
          // Where they are (set, a class, or a phone-free window). While it holds, keep replies short and don't add to their plate.
          ...(status ? { status } : {}),
          mode,
          focus: focus.top.map((f) => ({ ...item(f), ...(details.get(f.id) ? { details: details.get(f.id) } : {}) })),
          rest: focus.rest.map(item),
          doneToday: focus.doneToday,
          money: moneySummary(money),
          // How full today is, in minutes. Mention only if they're near or over, or asks.
          plate: { capacity: room.capacity, committed: room.committed, available: room.available, label: room.label },
          caughtUp,
          // Topics due for review (spaced repetition). Offer one as a short practice, don't list them all.
          reviewDue: learning
            .filter((l) => l.skill.status === "active")
            .flatMap((l) => l.summary.reviewDue.map((t) => ({ skill: l.skill.name, topic: t.topic, confidence: t.confidence })))
            .slice(0, 5),
          // Today's events, and important ones within the week (prepare for those).
          events: {
            today: soon.filter((e) => e.daysAway === 0).map((e) => ({ title: e.title, kind: e.kind, at: e.allDay ? "all day" : formatLocal(e.at, tz()) })),
            prepareNow: soon.filter((e) => e.daysAway > 0 && e.quadrant === "prepare_now").map((e) => ({ title: e.title, daysAway: e.daysAway })),
          },
          // Today's planned meals by slot. None planned: offer propose_meals when food comes up.
          ...(mealsToday.size ? { meals: Object.fromEntries(mealsToday) } : {}),
          // Days since any fun (null = no fun list yet: offer to start one). `ideas` only when they've earned a break or is overdue for one.
          fun: {
            daysSince: fun.daysSinceFun,
            ...(funDue || questsDone ? { ideas: fun.suggestions.map((f) => f.title), why: questsDone ? "quests_done" : "overdue" } : {}),
          },
          // Promises due within 2 days (or with no date). Remind them plainly; if one can't be kept, tell them now.
          promises: {
            dueSoon: promises.open.filter((p) => p.daysLeft === null || p.daysLeft <= 2).map((p) => ({ id: p.id, person: p.person, what: p.what, daysLeft: p.daysLeft })),
            ...(promises.patterns.length ? { patterns: promises.patterns } : {}),
          },
          // The week's load. Only raise it when it's tight or overloaded, and before the user takes on anything new.
          ...(hasFeature(currentPlan().plan, "loadAdvice") ? { week: { verdict: week.verdict, percent: Math.round(week.ratio * 100), ...(week.verdict !== "room" ? { dropCandidates: week.dropCandidates.slice(0, 3).map((d) => d.title) } : {}) } } : {}),
          // One or two people due a check-in, with something to talk about. Suggest reaching out; don't list everyone.
          ...(whoToReachOut(people, now, 2).length
            ? { reachOut: whoToReachOut(people, now, 2).map(({ person, due }) => ({ name: person.name, who: person.who, overdueBy: due.overdueBy, talkAbout: person.topics[0] ?? null })) }
            : {}),
          // This season's themes. Coach toward the focus; when something on notNow comes up, point to the theme and push back.
          ...(Object.keys(themes).length
            ? { themes: Object.fromEntries(Object.entries(themes).map(([k, t]) => [k, { title: t!.title, focus: t!.focus, notNow: t!.notNow }])) }
            : {}),
          // A review is owed: offer to do it now (prepare_review), briefly. No theme for the new month/year yet? Offer to set one.
          ...(owed.length ? { reviewsOwed: owed.map((o) => ({ period: o.period, label: o.label })) } : {}),
          // Just earned — celebrate it properly, once.
          ...(earned.length ? { newAchievements: earned.map((a) => ({ title: a.title, description: a.description, ...(a.detail ? { for: a.detail } : {}) })) } : {}),
          // Decisions due for a look back: ask how it turned out (review_decision).
          ...(decisions.some((d) => d.dueForReview) ? { decisionsToReview: decisions.filter((d) => d.dueForReview).map((d) => ({ id: d.id, decision: d.decision, expected: d.expected })) } : {}),
          // Experiments that have run their course: ask how it went, show list_experiments' numbers, then finish_experiment.
          ...(experimentsDue.length ? { experimentsToFinish: experimentsDue.map((e) => ({ id: e.id, change: e.change, question: e.question, metric: e.metric })) } : {}),
          // Their values, most important first. Weigh big choices against them quietly; name a clash once, never moralise.
          // Empty: when a big decision comes up, it's a good moment to offer to name them (set_values).
          values: values.map((v) => (v.why ? { value: v.value, why: v.why } : { value: v.value })),
          // What they know about themselves that should shape advice: patterns, triggers, weak spots, habits to break,
          // what they're healing from. Use it gently and specifically ("you tend to…"), never to shame.
          ...(self.length ? { knowThem: self } : {}),
          // Who they're becoming — coach toward it all chat. Null: offer to help them write one.
          becoming: identity ? { name: identity.name, text: identity.text } : null,
        });
      } catch (error) {
        return toolError(`get_today failed: ${(error as Error).message}`);
      }
    },
  );
}
