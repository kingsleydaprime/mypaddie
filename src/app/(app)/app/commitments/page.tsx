import Link from "next/link";
import { roleHistoryText } from "@/features/commitments/commitments";
import { currentPlan } from "@/shared/user-context";
import { hasFeature } from "@/features/plans/plans";
import { UpgradeNote } from "@/features/plans/ui/upgrade-note";
import { KIND_LABEL, type CommitmentPriority, type LoadVerdict } from "@/features/commitments/commitments";
import { changeRoleAction, setCommitmentAction } from "@/features/commitments/commitments.actions";
import { loadCommitments, loadWeekLoad } from "@/features/commitments/commitments.repo";
import { AddCommitmentForm } from "@/features/commitments/ui/add-commitment-form";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
const VERDICT: Record<LoadVerdict, { label: string; tone: string }> = {
  room: { label: "You have room", tone: "" },
  tight: { label: "Your plate is nearly full", tone: "text-gold" },
  overloaded: { label: "You've got too much on", tone: "text-red" },
};
const NEXT_PRIORITY: Record<CommitmentPriority, CommitmentPriority> = { core: "important", important: "optional", optional: "core" };

export default async function CommitmentsPage() {
  const db = await requireDb("/app/commitments");
  const now = new Date();
  const [list, load] = await Promise.all([loadCommitments(db, { includeEnded: true }), loadWeekLoad(db, now)]);
  const minutesFor = (id: string) => load.byCommitment.find((b) => b.id === id)?.minutes ?? 0;
  const live = list.filter((c) => c.status !== "ended");
  const ended = list.filter((c) => c.status === "ended");
  const pct = Math.round(load.ratio * 100);
  const advice = hasFeature(currentPlan().plan, "loadAdvice");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Commitments</h1>
      </header>

      {!advice && <UpgradeNote feature="loadAdvice" />}
      {advice && <section className="rounded-2xl border border-line bg-surface p-4">
        <p className={`font-semibold ${VERDICT[load.verdict].tone}`}>{VERDICT[load.verdict].label}</p>
        <p className="text-sm text-muted">Next 7 days: {hours(load.total)} of {hours(load.capacity)} ({pct}%)</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label={`${pct}% of the week's capacity`}>
          <div className={`h-full rounded-full ${load.verdict === "overloaded" ? "bg-red" : "bg-gold"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        {load.dropCandidates.length > 0 && (
          <p className="mt-2 text-sm">
            To get back to room, consider pausing: {load.dropCandidates.slice(0, load.dropCandidates.findIndex((d) => d.enough) + 1 || undefined).map((d) => `${d.title} (${hours(d.minutes)})`).join(", ")}.
          </p>
        )}
      </section>}

      <AddCommitmentForm />

      {live.length === 0 && <p className="text-sm text-muted">Nothing yet. Add your jobs, roles, groups and teams so Paddie can see how full your week is.</p>}
      {live.length > 0 && (
        <ul className="flex flex-col gap-2">
          {live.map((c) => (
            <li key={c.id} className={`rounded-2xl border border-line px-4 py-3 ${c.status === "paused" ? "" : "bg-surface"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate font-semibold ${c.status === "paused" ? "text-muted" : ""}`}>{c.title}{c.org ? `, ${c.org}` : ""}</span>
                <span className="shrink-0 text-sm text-muted">{c.status === "paused" ? "paused" : `${hours(minutesFor(c.id))}/wk`}</span>
              </div>
              <p className="text-xs text-muted">{KIND_LABEL[c.kind]}</p>
              {(c.roles.length > 1 || c.roles.some((r) => r.startsOn)) && <p className="mt-1 text-xs text-muted">{roleHistoryText(c.roles)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={setCommitmentAction.bind(null, c.id, { priority: NEXT_PRIORITY[c.priority] })}>
                  <SubmitButton className="rounded-full border border-line px-3 py-1 text-sm" aria-label={`Priority ${c.priority}, tap to change`}>{c.priority}</SubmitButton>
                </form>
                {c.status === "active" ? (
                  <form action={setCommitmentAction.bind(null, c.id, { status: "paused" })}>
                    <SubmitButton className="rounded-full border border-line px-3 py-1 text-sm text-muted">Pause</SubmitButton>
                  </form>
                ) : (
                  <form action={setCommitmentAction.bind(null, c.id, { status: "active" })}>
                    <SubmitButton className="rounded-full border border-gold px-3 py-1 text-sm text-gold">Resume</SubmitButton>
                  </form>
                )}
                <form action={setCommitmentAction.bind(null, c.id, { status: "ended" })}>
                  <SubmitButton className="rounded-full border border-line px-3 py-1 text-sm text-muted">End</SubmitButton>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted">Role changed?</summary>
                <form action={changeRoleAction.bind(null, c.id)} className="mt-2 flex flex-wrap gap-2">
                  <input name="title" required maxLength={120} placeholder="New role, e.g. Secretary" aria-label="New role"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5" />
                  <input name="from" type="date" aria-label="Since (default today)" className="rounded-lg border border-line bg-surface-2 px-2 py-1.5" />
                  <SubmitButton className="text-sm font-semibold text-gold">Save</SubmitButton>
                </form>
                <p className="mt-1 text-xs text-muted">Your old role is kept, with its dates.</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Pausing or ending stops its regular sessions. Competitions, meetings and extra training: tell Paddie and it ties them here.</p>

      {ended.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-bold text-muted">Ended</h2>
          {ended.map((c) => (
            <p key={c.id} className="text-sm text-muted">
              {c.org ?? c.title}: {roleHistoryText(c.roles) || c.title}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
