import { syncCalendar } from "@/features/calendar/calendar.repo";
import { currentThemes, owedReviews } from "@/features/reviews/reviews.repo";
import { checkAchievements } from "@/features/achievements/achievements.repo";
import { applyBrokenPromises } from "@/features/promises/promises.repo";
import { inProgress, startable, upcoming } from "@/features/events/events";
import { EventButtons } from "@/features/events/ui/event-buttons";
import { loadQuoteOfTheDay } from "@/features/quotes/quotes.repo";
import { loadQuits } from "@/features/quits/quits.repo";
import { shownName } from "@/features/quits/ui/labels";
import { loadXpSummary, type XpSummary } from "@/features/stats/stats.repo";
import Link from "next/link";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { loadLearning } from "@/features/learning/learning.repo";
import { loadMode } from "@/features/mode/mode.repo";
import { loadSchedule } from "@/features/settings/settings.repo";
import { lateNight } from "@/features/settings/schedule";
import type { Mode } from "@/shared/domain";
import { catchUp, loadTasksAroundToday } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, localTimeOf } from "@/shared/time";
import { pickFocus, type FocusItem } from "../focus";
import { TaskButtons } from "./task-buttons";
import { TaskMeta } from "./task-meta";
import { ExpandableText } from "./expandable-text";
import { RoutineSteps } from "./routine-steps";
import { ChecklistSteps } from "./checklist-steps";
import { Fold } from "./fold";
import { readChecklist, type Step } from "@/features/tasks/progress";
import { anyTimeLabel, dayEndsAt } from "@/features/settings/schedule";
import { StatusBar } from "@/features/status/ui/status-bar";
import { loadCheckin } from "@/features/metrics/metrics.repo";
import { CheckinForm } from "@/features/metrics/ui/checkin-form";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

/** One line of narration, in Paddie's voice, set by the mode. Never a stat. */
const NARRATION: Record<Mode, string> = {
  curious: "Here's what matters right now. Do one.",
  strict: "Same slips, same story. Today the plan changes. Start at the top.",
  soft: "Rough day. Smallest one first — that still counts.",
  strictest: "No mercy mode. You asked for this. Go.",
  softest: "Easy day. One thing done is a win.",
};

function due(item: FocusItem, now: Date, anyTime: string) {
  if (!item.dueAt) return anyTime;
  // 23:59 is how "any time that day" is stored.
  const at = localTimeOf(item.dueAt, tz());
  const time = at === "23:59" ? anyTime : at;
  return dayKey(item.dueAt, tz()) === dayKey(now, tz()) ? time : `yesterday ${time}`;
}

function Row({ item, now, big, details, checklist, anyTime }: { item: FocusItem; now: Date; big?: boolean; details?: string | null; checklist?: Step[]; anyTime: string }) {
  const hasChecklist = !item.routine && checklist !== undefined && checklist.length > 0;
  return (
    <li className={`rounded-2xl border border-line bg-surface shadow-sm shadow-black/5 ${big ? "p-4" : "px-4 py-3"}`}>
      <div className="min-w-0">
        {/* A routine's title opens the routine; its steps are ticked right here. */}
        <Link href={item.routine ? "/app/routines" : `/app/tasks/${item.id}`} className={`block truncate font-semibold ${big ? "text-[17px]" : "text-base"}`}>
          {item.title}
        </Link>
        {/* Steps open on the top three, folded in the list; tap the line to switch. */}
        {item.routine && (
          <Fold defaultOpen={big} summary={<>{item.routine.done}/{item.routine.total} done · next: <span className="text-text">{item.routine.next}</span></>}>
            <RoutineSteps steps={item.routine.items} />
          </Fold>
        )}
        {/* The checklist's count moves from the meta line to its own fold. */}
        <TaskMeta item={hasChecklist ? { ...item, steps: null } : item} now={now} />
        {hasChecklist && (
          <Fold defaultOpen={big} summary={`${checklist.filter((s) => s.done).length}/${checklist.length} steps`}>
            <ChecklistSteps taskId={item.id} steps={checklist} />
          </Fold>
        )}
        {/* A preview: two lines on the top three, one in the list. Tap to read it all. */}
        {details && <ExpandableText text={details} lines={big ? 2 : 1} />}
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
          <span className={item.overdue ? "font-medium text-red" : ""}>{item.overdue ? `overdue · ${due(item, now, anyTime)}` : due(item, now, anyTime)}</span>
          {item.nonNegotiable && <span className="rounded-full bg-gold/10 px-2 py-px text-xs font-medium text-gold">must</span>}
        </p>
      </div>
      <TaskButtons taskId={item.id} title={item.routine ? item.routine.next : item.title} running={item.startedAt !== null} spentMinutes={item.spentMinutes} mustDo={item.nonNegotiable || item.need} habit={item.habit} routine={!!item.routine} routineTitle={item.routine?.title} routineSteps={item.routine?.items.map((i) => ({ id: i.id, title: i.title, status: i.status }))} />
    </li>
  );
}

/** Level, the bar to the next one, and what today has earned so far. Taps through to Stats. */
function XpStrip({ xp }: { xp: XpSummary }) {
  const pct = Math.round(Math.min(1, Math.max(0, xp.progress)) * 100);
  return (
    <Link href="/app/stats" className="block rounded-2xl border border-line bg-surface p-4 shadow-sm shadow-black/5" aria-label={`Level ${xp.level}, ${xp.toNext} XP to the next level. Open stats`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Level</span>
          <span className="text-2xl font-bold tabular-nums text-gold">{xp.level}</span>
        </p>
        <p className="text-sm tabular-nums">
          <span className={`font-semibold ${xp.today < 0 ? "text-red" : "text-gold"}`}>{xp.today > 0 ? "+" : ""}{xp.today} XP</span>
          <span className="text-muted"> today</span>
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-xs tabular-nums text-muted">
        <span>{xp.xp.toLocaleString()} XP</span>
        <span>{xp.toNext.toLocaleString()} to level {xp.level + 1} · {xp.lastWeek >= 0 ? "+" : ""}{xp.lastWeek} this week</span>
      </p>
    </Link>
  );
}

export async function TodayScreen({ db }: { db: Db }) {
  const now = new Date();
  await catchUp(db, now);
  await applyBrokenPromises(db, now);
  // Keep imported Google Calendar events fresh (at most every 30 minutes; failures are recorded, not thrown).
  await syncCalendar(db, now).catch(() => null);
  const [tasks, mode, events, learning, schedule, themes, owed, earned, checkin, xp, quote, homeQuits] = await Promise.all([
    loadTasksAroundToday(db, now), loadMode(db, now), loadUpcomingEvents(db), loadLearning(db, now), loadSchedule(db),
    currentThemes(db, now), owedReviews(db, now), checkAchievements(db, now), loadCheckin(db, dayKey(now, tz())),
    // After checkAchievements' write would be nicer, but a new badge's +25 shows on the next refresh anyway.
    loadXpSummary(db, now, tz()), loadQuoteOfTheDay(db, dayKey(now, tz())),
    // Only quits the user put on Home; one cheap read when there are none.
    loadQuits(db, now, { onHome: true }),
  ]);
  const review = learning
    .filter((l) => l.skill.status === "active")
    .flatMap((l) => l.summary.reviewDue.map((t) => `${t.topic} (${l.skill.name})`));
  const soon = upcoming(events, now, schedule.eventCloseDays, undefined, schedule.eventCloseDays);
  const todayEvents = soon.filter((e) => e.daysAway === 0);
  // Today's events as cards: happening right now (by its time, or started early) first.
  const todayAt = new Map(todayEvents.map((v) => [v.id, v.at]));
  const todayCards = events.flatMap((e) => {
    const p = inProgress(e, now);
    const at = todayAt.get(e.id) ?? (p ? e.startsAt : null);
    return at ? [{ id: e.id, title: e.title, at, allDay: e.allDay, startable: startable(e), until: p?.until ?? null }] : [];
  }).sort((a, b) => Number(b.until !== null) - Number(a.until !== null) || a.at.getTime() - b.at.getTime());
  const prepare = soon.filter((e) => e.daysAway > 0 && e.quadrant === "prepare_now");
  const focus = pickFocus(tasks, now, 3, undefined, schedule.showTimedWithin);
  const anyTime = anyTimeLabel(dayEndsAt(schedule));
  // Opening the app during quiet hours means they're up when they meant to be asleep.
  const late = lateNight(schedule, localTimeOf(now, tz()));
  const shownIds = [...focus.top, ...focus.rest].map((f) => f.id);
  const { data: detailRows } = shownIds.length
    ? await db.from("tasks").select("id, details, checklist").in("id", shownIds).or("details.not.is.null,checklist.not.is.null")
    : { data: [] as { id: string; details: string | null; checklist: unknown }[] };
  const details = new Map((detailRows ?? []).map((d) => [d.id, d.details]));
  const checklists = new Map((detailRows ?? []).map((d) => [d.id, readChecklist(d.checklist)]));
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz(), weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-muted">{date}{themes.month ? <> · <span className="text-gold">{themes.month.title}</span></> : null}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{NARRATION[mode.mode]}</h1>
        {prepare.length > 0 && (
          <Link href="/app/events" className="mt-2 block text-sm text-muted">
            <span>Coming up: </span>
            {prepare.map((e) => (
              <span key={e.id} className="text-gold">
                {e.title} in {e.daysAway}d{" "}
              </span>
            ))}
          </Link>
        )}
      </header>

      {late && (
        <div className="rounded-2xl border border-gold bg-surface p-4" role="status">
          <p className="font-semibold">It&rsquo;s {late.at}. Your quiet hours started at {late.quietSince}.</p>
          <p className="mt-1 text-sm text-muted">
            Close this and sleep — {Math.floor(late.sleepLeft / 60)}h{late.sleepLeft % 60 ? ` ${String(late.sleepLeft % 60).padStart(2, "0")}m` : ""} until {late.wakeAt}. It&rsquo;ll all be here in the morning.
          </p>
        </div>
      )}

      <XpStrip xp={xp} />
      {homeQuits.length > 0 && (
        // A count only: no slip button on Home, so it can't be tapped by accident or seen over a shoulder.
        <p className="-mt-4 flex flex-wrap gap-x-4 px-1 text-sm text-muted">
          {homeQuits.map(({ quit: q }) => (
            <Link key={q.id} href={`/app/quits/${q.id}`}>
              {shownName(q)} · <span className="font-semibold tabular-nums text-gold">day {q.progress.currentDays}</span>
            </Link>
          ))}
        </p>
      )}

      {quote && (
        <Link href="/app/me/quotes" className="block border-l-2 border-gold/60 py-0.5 pl-4" aria-label="Today's quote. Open your quotes">
          <figure>
            <blockquote className="text-pretty text-[15px] leading-relaxed italic">&ldquo;{quote.text}&rdquo;</blockquote>
            {quote.author && <figcaption className="mt-1 text-xs text-muted">— {quote.author}</figcaption>}
          </figure>
        </Link>
      )}

      {todayCards.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="today-events">
          <h2 id="today-events" className="text-xs font-medium uppercase tracking-wider text-muted">Today&rsquo;s events</h2>
          <ul className="flex flex-col gap-2">
            {todayCards.map((e) => (
              <li key={e.id} className={`rounded-2xl border bg-surface px-4 py-3 shadow-sm shadow-black/5 ${e.until ? "border-gold" : "border-line"}`}>
                <p className="truncate font-semibold">{e.title}</p>
                <p className="text-sm">
                  {e.until ? (
                    <><span className="font-medium text-gold">Happening now</span> <span className="text-muted">· until {localTimeOf(e.until, tz())}</span></>
                  ) : (
                    <span className="text-muted">{e.allDay ? "All day" : localTimeOf(e.at, tz())}</span>
                  )}
                </p>
                <EventButtons eventId={e.id} title={e.title} startable={e.startable} happening={e.until !== null} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <StatusBar db={db} />

      {earned.length > 0 && (
        <div className="rounded-2xl border border-gold bg-surface p-4" role="status">
          {earned.map((a) => (
            <p key={a.key} className="font-semibold">🏆 Achievement: {a.title} <span className="font-normal text-muted">— {a.description}{a.detail ? ` (${a.detail})` : ""}</span></p>
          ))}
        </div>
      )}

      {owed.length > 0 && (
        <Link href={`/app/growth/review?period=${owed[0]!.period}&day=${owed[0]!.start}`} className="block rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">{owed[0]!.label} is ready for review <span className="text-gold">›</span></p>
          <p className="text-sm text-muted">Ten minutes to look back, then a cleaner start.</p>
        </Link>
      )}

      {focus.top.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-lg font-semibold">Quest log: clear.</p>
          <p className="mt-1 text-muted">Nothing due. Go enjoy yourself — rest is part of the game.</p>
          <Link href="/app/tasks" className="mt-3 inline-block text-sm font-semibold text-gold">See what&rsquo;s coming up ›</Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {focus.top.map((item) => (
            <Row key={item.id} item={item} now={now} big details={details.get(item.id)} checklist={checklists.get(item.id)} anyTime={anyTime} />
          ))}
        </ol>
      )}

      {focus.rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-wider text-muted">
            Everything else ({focus.rest.length}) <span className="group-open:hidden">›</span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {focus.rest.map((item) => (
              <Row key={item.id} item={item} now={now} details={details.get(item.id)} checklist={checklists.get(item.id)} anyTime={anyTime} />
            ))}
          </ul>
        </details>
      )}

      {review.length > 0 && (
        <p className="text-sm text-muted">
          <span className="font-medium text-gold">Worth a quick review: </span>
          {review.slice(0, 2).join(", ")}
          {review.length > 2 && ` +${review.length - 2}`}
        </p>
      )}

      {!checkin && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">How are you today? <span className="text-muted">Energy, mood, sleep — 10 seconds</span></summary>
          <div className="mt-3"><CheckinForm current={null} /></div>
        </details>
      )}

      {focus.doneToday > 0 && <Link href="/app/done" className="text-center text-sm text-muted underline-offset-4 hover:underline">{focus.doneToday} done today · undo a mistake</Link>}

      <nav className="grid grid-cols-3 gap-2">
        <Link href="/app/plan" className="rounded-xl border border-line bg-surface px-2 py-2.5 text-center text-sm font-medium">Plan my day</Link>
        <Link href="/app/events" className="rounded-xl border border-line bg-surface px-2 py-2.5 text-center text-sm font-medium">Events</Link>
        <Link href="/app/workout" className="rounded-xl border border-line bg-surface px-2 py-2.5 text-center text-sm font-medium">Workout</Link>
        <Link href="/app/close" className="col-span-3 rounded-xl border border-line bg-surface px-2 py-2.5 text-center text-sm font-medium">Close out the day</Link>
      </nav>
    </div>
  );
}
