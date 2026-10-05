import Link from "next/link";
import type { Urgency } from "@/features/applications/applications";
import { loadApplications } from "@/features/applications/applications.repo";
import { AddApplicationForm } from "@/features/applications/ui/add-application-form";
import { DEFAULT_CONFIG } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { formatLocal } from "@/shared/time";

const GROUPS: { u: Urgency; title: string; tone?: string }[] = [
  { u: "past_target", title: "Past your target — deadline still open", tone: "text-red" },
  { u: "due_soon", title: "Due soon", tone: "text-gold" },
  { u: "upcoming", title: "Upcoming" },
  { u: "rolling", title: "Rolling — apply soon" },
  { u: "done", title: "Submitted & after" },
  { u: "closed", title: "Closed" },
];

export default async function ApplicationsPage() {
  const db = await requireDb("/applications");
  const apps = await loadApplications(db, new Date());
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Applications</h1>
      </header>
      <AddApplicationForm />
      {apps.length === 0 && <p className="text-sm text-muted">Nothing yet. Add one above, or tell Paddie about it.</p>}
      {GROUPS.map(({ u, title, tone }) => {
        const list = apps.filter((a) => a.summary.urgency === u);
        if (!list.length) return null;
        return (
          <section key={u} className="flex flex-col gap-2">
            <h2 className={`font-bold ${tone ?? ""}`}>{title}</h2>
            <ul className="flex flex-col gap-2">
              {list.map((a) => {
                const { done, total } = a.summary.progress;
                return (
                  <li key={a.id}>
                    <Link href={`/applications/${a.id}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">{a.title}</span>
                        <span className="shrink-0 text-xs text-muted">{a.status}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {a.deadline_at ? `Closes ${formatLocal(new Date(a.deadline_at), DEFAULT_CONFIG.timeZone)}` : "Rolling"}
                        {a.summary.daysToTarget !== null && a.summary.urgency !== "done" && ` · ${a.summary.daysToTarget >= 0 ? `${a.summary.daysToTarget}d to target` : `target was ${-a.summary.daysToTarget}d ago`}`}
                      </p>
                      {total > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} requirements`}>
                          <div className="h-full rounded-full bg-gold" style={{ width: `${(done / total) * 100}%` }} />
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
