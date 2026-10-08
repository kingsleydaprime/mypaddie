import Link from "next/link";
import { pickFocus, type FocusItem } from "@/features/today/focus";
import { DoneButton } from "@/features/today/ui/done-button";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, localTimeOf } from "@/shared/time";
import { dayLabel, type NextAt, type RoutineSummary } from "../overview";
import { loadTaskOverview } from "../overview.repo";
import { catchUp, loadTasksAroundToday } from "../tasks.repo";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

const when = (n: NextAt, today: string) => `${dayLabel(n.day, today)}${n.time ? ` · ${n.time}` : " · any time"}`;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between">
        <span className="text-lg font-bold">{title}</span>
        {count !== undefined && <span className="text-sm text-muted">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">{children}</p>
);

function TodayRow({ item, now }: { item: FocusItem; now: Date }) {
  const time = item.dueAt ? localTimeOf(item.dueAt, tz()) : null;
  const label = !time || time === "23:59" ? "any time" : dayKey(item.dueAt!, tz()) === dayKey(now, tz()) ? time : `yesterday ${time}`;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/app/tasks/${item.id}`} className="block truncate font-semibold">{item.title}</Link>
        {item.routine && <p className="mt-0.5 text-sm">Next: {item.routine.next} <span className="text-muted">· {item.routine.done}/{item.routine.total}</span></p>}
        <p className="mt-0.5 text-sm text-muted">
          <span className={item.overdue ? "font-medium text-red" : ""}>{item.overdue ? `overdue · ${label}` : label}</span>
          {item.nonNegotiable && <span className="text-gold"> · must</span>}
        </p>
      </div>
      <DoneButton taskId={item.id} title={item.routine ? item.routine.next : item.title} />
    </li>
  );
}

function RoutineCard({ r, today }: { r: RoutineSummary; today: string }) {
  let status: React.ReactNode;
  if (r.steps.length === 0) status = <span className="text-red">No steps yet — ask Paddie to add some.</span>;
  else if (r.today?.nextStep) status = <>Today · {r.today.done}/{r.today.total} done · next: <span className="text-text">{r.today.nextStep}</span></>;
  else if (r.today && r.next) status = <>Done today · next: {when(r.next, today)}</>;
  else if (r.next) status = <>Next: {when(r.next, today)}</>;
  else status = r.today ? "Done today" : "Not scheduled";
  return (
    <li>
      <Link href="/app/routines" className="block rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{r.title}</span>
          <span className="shrink-0 text-sm text-muted">{r.steps.length} steps{r.rule ? ` · ${r.rule}` : ""}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted">{status}</p>
      </Link>
    </li>
  );
}

export async function TasksScreen({ db }: { db: Db }) {
  const now = new Date();
  await catchUp(db, now);
  const [around, overview] = await Promise.all([loadTasksAroundToday(db, now), loadTaskOverview(db, now)]);
  const focus = pickFocus(around, now);
  const open = [...focus.top, ...focus.rest];
  const today = dayKey(now, tz());

  const byDay = new Map<string, typeof overview.upcoming>();
  for (const t of overview.upcoming) {
    const d = dayKey(t.dueAt, tz());
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Tasks &amp; habits</h1>
        <p className="mt-1 text-sm text-muted">Everything you do, in one place. Ask Paddie to add, move or stop any of it.</p>
      </header>

      <Section title="Today" count={open.length}>
        {open.length === 0 ? (
          <Empty>Nothing open today.{focus.doneToday > 0 ? ` ${focus.doneToday} done.` : ""}</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((item) => <TodayRow key={item.id} item={item} now={now} />)}
          </ul>
        )}
        {focus.doneToday > 0 && open.length > 0 && (
          <Link href="/app/done" className="text-sm text-muted">{focus.doneToday} done today ›</Link>
        )}
      </Section>

      <Section title="Routines" count={overview.routines.length}>
        {overview.routines.length === 0 ? (
          <Empty>None yet. Try: &ldquo;my morning routine is pray, read, brush, bath — from 6am&rdquo;.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.routines.map((r) => <RoutineCard key={r.id} r={r} today={today} />)}
          </ul>
        )}
      </Section>

      <Section title="Habits" count={overview.habits.length}>
        {overview.habits.length === 0 ? (
          <Empty>No habits outside your routines.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.habits.map((h) => {
              const body = (
                <>
                  <p className="font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{h.rule}{h.next ? ` · next ${when(h.next, today)}` : ""}</p>
                </>
              );
              return (
                <li key={h.seriesId}>
                  {h.openId ? (
                    <Link href={`/app/tasks/${h.openId}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">{body}</Link>
                  ) : (
                    <div className="rounded-2xl border border-line bg-surface px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Coming up" count={overview.upcoming.length}>
        {overview.upcoming.length === 0 ? (
          <Empty>Nothing else booked this week.</Empty>
        ) : (
          [...byDay].map(([day, tasks]) => (
            <div key={day} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-muted">{dayLabel(day, today)}</p>
              <ul className="flex flex-col gap-2">
                {tasks.map((t) => {
                  const time = localTimeOf(t.dueAt, tz());
                  return (
                    <li key={t.id}>
                      <Link href={`/app/tasks/${t.id}`} className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                        <span className="truncate font-semibold">{t.title}</span>
                        <span className="shrink-0 text-sm text-muted">{time === "23:59" ? "any time" : time}{t.nonNegotiable && <span className="text-gold"> · must</span>}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
