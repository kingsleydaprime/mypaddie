import Link from "next/link";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import { loadTaskHistory, type TaskHistoryRecord } from "../history.repo";
import { SettleButtons } from "./settle-buttons";

export const HISTORY_TABS = ["open", "done", "missed", "all"] as const;
export type HistoryTab = (typeof HISTORY_TABS)[number];

const TAB_LABEL: Record<HistoryTab, string> = { open: "Open", done: "Done", missed: "Missed", all: "All" };
const LIMIT = 300;

/** Still open on a day that's over: the loose ends this page exists to settle. */
const isLooseEnd = (r: TaskHistoryRecord, today: string) => r.status === "pending" && r.date < today;

function inTab(r: TaskHistoryRecord, tab: HistoryTab, today: string): boolean {
  if (tab === "open") return isLooseEnd(r, today);
  if (tab === "done") return r.status === "done";
  if (tab === "missed") return r.status === "missed";
  return true;
}

function Dot({ r, today }: { r: TaskHistoryRecord; today: string }) {
  const base = "absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full";
  if (r.status === "done") return <span className={`${base} bg-green`} aria-hidden />;
  if (r.status === "missed") return <span className={`${base} bg-red`} aria-hidden />;
  if (isLooseEnd(r, today)) return <span className={`${base} bg-bg ring-2 ring-gold`} aria-hidden />;
  return <span className={`${base} bg-line`} aria-hidden />;
}

function note(r: TaskHistoryRecord, today: string): string | null {
  const bits: string[] = [];
  if (r.routine) bits.push(r.routine);
  if (r.status === "done" && r.late) bits.push("done late");
  if (r.status === "missed" && r.miss && r.miss.reason !== "Self-reported miss") bits.push(r.miss.reason);
  if (r.status === "cancelled") bits.push("let go");
  if (r.status === "skipped") bits.push("skipped");
  if (r.slips.length > 0) bits.push(r.slips.length === 1 ? "slipped once" : `slipped ${r.slips.length}×`);
  if (r.status === "pending" && r.date >= today) bits.push("still on Today");
  return bits.length ? bits.join(" · ") : null;
}

function Row({ r, today }: { r: TaskHistoryRecord; today: string }) {
  const loose = isLooseEnd(r, today);
  const titleTone =
    r.status === "missed" ? "text-muted line-through decoration-red/70"
    : r.status === "cancelled" || r.status === "skipped" ? "text-muted line-through"
    : r.status === "done" ? "text-text/80"
    : "font-semibold";
  const sub = note(r, today);
  return (
    <li className="relative py-2">
      <Dot r={r} today={today} />
      {loose ? (
        <Link href={`/app/tasks/${r.task_id}`} className={`block truncate ${titleTone}`}>{r.title}</Link>
      ) : (
        <p className={`truncate ${titleTone}`}>{r.title}</p>
      )}
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      {loose && <SettleButtons taskId={r.task_id} title={r.title} />}
    </li>
  );
}

export async function HistoryScreen({ db, tab, weeks }: { db: Db; tab: HistoryTab; weeks: number }) {
  const { timeZone } = currentConfig();
  const today = dayKey(new Date(), timeZone);
  const from = addDays(today, -weeks * 7);
  const { tasks, nextOffset } = await loadTaskHistory(db, { from, to: today, limit: LIMIT, offset: 0, newestFirst: true });

  const counts = Object.fromEntries(HISTORY_TABS.map((t) => [t, tasks.filter((r) => inTab(r, t, today)).length])) as Record<HistoryTab, number>;
  const shown = tasks.filter((r) => inTab(r, tab, today));
  const byDay = new Map<string, TaskHistoryRecord[]>();
  for (const r of shown) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);

  const dayLabel = (day: string) => {
    if (day === today) return "Today";
    if (day === addDays(today, -1)) return "Yesterday";
    return zonedInstant(day, "12:00", timeZone).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });
  };
  const href = (t: HistoryTab, w = weeks) => `/app/history?show=${t}${w !== 4 ? `&weeks=${w}` : ""}`;
  const span = weeks === 1 ? "this past week" : `the last ${weeks} weeks`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/app/more" className="text-sm text-muted">‹ Others</Link>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted">What you did, what slipped, and what&apos;s still hanging.</p>
      </header>

      <nav aria-label="Filter history" className="flex gap-1 rounded-full border border-line bg-surface p-1">
        {HISTORY_TABS.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={href(t)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-surface-2 text-text" : "text-muted"}`}
            >
              {TAB_LABEL[t]}
              {t === "open" && counts.open > 0 && <span className="rounded-full bg-gold px-1.5 text-[0.7rem] leading-4 text-on-gold">{counts.open}</span>}
            </Link>
          );
        })}
      </nav>

      {tab === "open" && counts.open > 0 && (
        <p className="border-l-2 border-gold pl-3 text-sm text-muted">
          <span className="font-semibold text-text">{counts.open} loose {counts.open === 1 ? "end" : "ends"}</span> from {span}. Tick what you did,
          own what you missed, let go of the rest. Late still pays, but less once it&apos;s more than two days old.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-12 text-center">
          <span className="mb-2 size-2.5 rounded-full bg-gold" aria-hidden />
          <p className="font-semibold">{tab === "open" ? "No loose ends." : "Nothing here yet."}</p>
          <p className="text-sm text-muted">{tab === "open" ? `Everything from ${span} is settled.` : `Nothing ${TAB_LABEL[tab].toLowerCase()} in ${span}.`}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay].sort(([a], [b]) => b.localeCompare(a)).map(([day, rows]) => (
            <section key={day} aria-label={dayLabel(day)}>
              <h2 className="sticky top-0 z-10 bg-bg/90 py-1 text-xs font-semibold uppercase tracking-wider text-muted backdrop-blur">
                {dayLabel(day)}
              </h2>
              <ol className="ml-1 border-l border-line pl-5">
                {rows.map((r) => <Row key={r.task_id} r={r} today={today} />)}
              </ol>
            </section>
          ))}
        </div>
      )}

      <footer className="flex flex-col items-center gap-1 pb-4 text-sm">
        {nextOffset !== null && <p className="text-xs text-muted">Showing the latest {LIMIT}.</p>}
        {weeks < 52 && (
          <Link href={href(tab, Math.min(52, weeks + 8))} className="font-semibold text-gold">Look further back</Link>
        )}
      </footer>
    </div>
  );
}
