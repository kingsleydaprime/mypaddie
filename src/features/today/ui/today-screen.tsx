import { syncCalendar } from "@/features/calendar/calendar.repo";
import { applyBrokenPromises } from "@/features/promises/promises.repo";
import { upcoming } from "@/features/events/events";
import Link from "next/link";
import { loadUpcomingEvents } from "@/features/events/events.repo";
import { loadLearning } from "@/features/learning/learning.repo";
import { loadMode } from "@/features/mode/mode.repo";
import { loadSchedule } from "@/features/settings/settings.repo";
import type { Mode } from "@/shared/domain";
import { catchUp, loadTasksAroundToday } from "@/features/tasks/tasks.repo";
import { DEFAULT_CONFIG } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, localTimeOf } from "@/shared/time";
import { pickFocus, type FocusItem } from "../focus";
import { DoneButton } from "./done-button";

const tz = DEFAULT_CONFIG.timeZone;

/** One line of narration, in Paddie's voice, set by the mode. Never a stat. */
const NARRATION: Record<Mode, string> = {
  curious: "Here's what matters right now. Do one.",
  strict: "Same slips, same story. Today the plan changes. Start at the top.",
  soft: "Rough day. Smallest one first — that still counts.",
  strictest: "No mercy mode. You asked for this. Go.",
  softest: "Easy day. One thing done is a win.",
};

function due(item: FocusItem, now: Date) {
  if (!item.dueAt) return "any time";
  const time = localTimeOf(item.dueAt, tz);
  return dayKey(item.dueAt, tz) === dayKey(now, tz) ? time : `yesterday ${time}`;
}

function Row({ item, now, big }: { item: FocusItem; now: Date; big?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl border border-line bg-surface ${big ? "p-4" : "px-4 py-3"}`}>
      <div className="min-w-0 flex-1">
        <Link href={`/app/tasks/${item.id}`} className={`block truncate font-semibold ${big ? "text-lg" : "text-base"}`}>
          {item.title}
        </Link>
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
          <span className={item.overdue ? "font-medium text-red" : ""}>{item.overdue ? `overdue · ${due(item, now)}` : due(item, now)}</span>
          {item.nonNegotiable && <span className="text-gold">· must</span>}
        </p>
      </div>
      <DoneButton taskId={item.id} title={item.title} />
    </li>
  );
}

export async function TodayScreen({ db }: { db: Db }) {
  const now = new Date();
  await catchUp(db, now);
  await applyBrokenPromises(db, now);
  // Keep imported Google Calendar events fresh (at most every 30 minutes; failures are recorded, not thrown).
  await syncCalendar(db, now).catch(() => null);
  const [tasks, mode, events, learning, schedule] = await Promise.all([loadTasksAroundToday(db, now), loadMode(db, now), loadUpcomingEvents(db), loadLearning(db, now), loadSchedule(db)]);
  const review = learning
    .filter((l) => l.skill.status === "active")
    .flatMap((l) => l.summary.reviewDue.map((t) => `${t.topic} (${l.skill.name})`));
  const soon = upcoming(events, now, schedule.eventCloseDays, undefined, schedule.eventCloseDays);
  const todayEvents = soon.filter((e) => e.daysAway === 0);
  const prepare = soon.filter((e) => e.daysAway > 0 && e.quadrant === "prepare_now");
  const focus = pickFocus(tasks, now);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-muted">{date}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{NARRATION[mode.mode]}</h1>
        {(todayEvents.length > 0 || prepare.length > 0) && (
          <Link href="/app/events" className="mt-2 block text-sm text-muted">
            {todayEvents.map((e) => (e.allDay ? e.title : `${e.title} ${localTimeOf(e.at, tz)}`)).join(" · ")}
            {todayEvents.length > 0 && prepare.length > 0 && " · "}
            {prepare.map((e) => (
              <span key={e.id} className="text-gold">
                {e.title} in {e.daysAway}d{" "}
              </span>
            ))}
          </Link>
        )}
      </header>

      {focus.top.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-lg font-semibold">Quest log: clear.</p>
          <p className="mt-1 text-muted">Nothing due. Go enjoy yourself — rest is part of the game.</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {focus.top.map((item) => (
            <Row key={item.id} item={item} now={now} big />
          ))}
        </ol>
      )}

      {focus.rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted">
            Everything else ({focus.rest.length}) <span className="group-open:hidden">›</span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {focus.rest.map((item) => (
              <Row key={item.id} item={item} now={now} />
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

      {focus.doneToday > 0 && <p className="text-center text-sm text-muted">{focus.doneToday} done today.</p>}

      <nav className="grid grid-cols-3 gap-2">
        <Link href="/app/plan" className="rounded-xl border border-line px-2 py-3 text-center text-sm font-medium">Plan my day</Link>
        <Link href="/app/events" className="rounded-xl border border-line px-2 py-3 text-center text-sm font-medium">Events</Link>
        <Link href="/app/workout" className="rounded-xl border border-line px-2 py-3 text-center text-sm font-medium">Workout</Link>
      </nav>
    </div>
  );
}
