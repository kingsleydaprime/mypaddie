import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadQuit, loadQuitHistory } from "@/features/quits/quits.repo";
import type { QuitTimelineEntry, QuitUnit } from "@/features/quits/quits";
import { milestoneXp, shownName, unitLabel } from "@/features/quits/ui/labels";
import { QuitCounter } from "@/features/quits/ui/quit-counter";
import { QuitSettings } from "@/features/quits/ui/quit-settings";
import { SlipButton } from "@/features/quits/ui/slip-button";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { dayKey, localTimeOf } from "@/shared/time";

const tz = () => currentConfig().timeZone;
type Log = { id: string; at: Date; amount: number | null; note: string | null; cause: string | null };

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Entry({ e, unit }: { e: QuitTimelineEntry<Log>; unit: QuitUnit | null }) {
  const dot = "absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full";
  const time = <span className="text-muted">{localTimeOf(e.at, tz())}</span>;
  const extra = "log" in e ? [e.log.cause, e.log.note].filter(Boolean) : [];
  let tone = "bg-line";
  let text: ReactNode;
  switch (e.type) {
    case "started":
      tone = "bg-gold";
      text = <>{e.again ? "Started again" : "Started"}{e.cap !== null ? `, at most ${e.cap} ${unitLabel(unit, e.cap)} a day` : ""}</>;
      break;
    case "stopped":
      text = "Stopped";
      break;
    case "cap":
      tone = "bg-gold/50";
      text = <>Cap {e.change} to {e.cap} {unitLabel(unit, e.cap)}{e.change === "raised" ? ", a new attempt" : ", streak kept"}</>;
      break;
    case "slip":
      tone = "bg-red";
      text = "Slipped";
      break;
    case "used":
      tone = e.tippedOver ? "bg-red" : "bg-line";
      text = (
        <>
          {e.log.amount} {unitLabel(unit, e.log.amount ?? 0)}
          <span className="text-muted"> · {e.dayTotal}{e.cap !== null ? `/${e.cap}` : ""} that day</span>
          {e.tippedOver && <span className="text-red"> · over the cap</span>}
        </>
      );
      break;
  }
  return (
    <li className="relative py-2">
      <span className={`${dot} ${tone}`} aria-hidden />
      <p className="text-sm">{time} · {text}</p>
      {extra.length > 0 && <p className="text-xs text-muted">{extra.join(" · ")}</p>}
    </li>
  );
}

export default async function QuitPage({ params }: PageProps<"/app/quits/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/quits/${id}`);
  const loaded = await loadQuit(db, id, new Date());
  if (!loaded) notFound();
  const { quit, milestonesPaid } = loaded;
  const { entries, capped } = await loadQuitHistory(db, quit.id, quit.kind);

  const byDay = new Map<string, QuitTimelineEntry<Log>[]>();
  for (const e of entries) {
    const d = dayKey(e.at, tz());
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const top = milestonesPaid.length ? Math.max(...milestonesPaid) : null;
  const earned = milestonesPaid.reduce((s, d) => s + milestoneXp(d), 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quits" className="text-muted" aria-label="Back to quitting">‹ Quitting</Link>
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{shownName(quit)}</h1>
        {top !== null && (
          <p className="rounded-2xl border border-gold bg-surface p-4 font-semibold" role="status">
            Day {top}. <span className="text-gold">+{earned} XP</span>
            <span className="block text-sm font-normal text-muted">{top >= 30 ? "That's real. Keep it boring." : "Good. Now the next one."}</span>
          </p>
        )}
        <QuitCounter quit={quit} />
        {quit.why && <p className="border-l-2 border-gold/60 pl-3 text-sm italic">{quit.why}</p>}
        {quit.status === "active" && <SlipButton id={quit.id} kind={quit.kind} unit={quit.unit} longest={quit.progress.longestDays} />}
      </section>

      <QuitSettings quit={quit} />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-muted">History</h2>
        {[...byDay].map(([day, rows]) => (
          <section key={day} aria-label={dayLabel(day)}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{dayLabel(day)}</h3>
            <ol className="ml-1 border-l border-line pl-5">
              {rows.map((e, i) => <Entry key={`${e.type}-${e.at.getTime()}-${i}`} e={e} unit={quit.unit} />)}
            </ol>
          </section>
        ))}
        {capped && <p className="text-xs text-muted">Showing the latest 200 logs.</p>}
      </section>
    </div>
  );
}
