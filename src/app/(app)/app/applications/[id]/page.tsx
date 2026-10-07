import Link from "next/link";
import { notFound } from "next/navigation";
import { APPLICATION_STATUSES } from "@/features/applications/applications";
import { addRequirementAction, setStatusAction, toggleRequirementAction } from "@/features/applications/applications.actions";
import { loadApplications } from "@/features/applications/applications.repo";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { formatLocal } from "@/shared/time";

export default async function ApplicationPage({ params }: PageProps<"/app/applications/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/applications/${id}`);
  const app = (await loadApplications(db, new Date())).find((a) => a.id === id);
  if (!app) notFound();
  const deadline = app.deadline_at ? new Date(app.deadline_at) : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/applications" className="text-muted" aria-label="Back to applications">‹ Applications</Link>
      </header>
      <section>
        <h1 className="text-2xl font-bold">{app.title}</h1>
        <p className="text-sm text-muted">{[app.org, app.kind].filter(Boolean).join(" · ")}</p>
        {app.link && <a href={app.link} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-gold">{app.link}</a>}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        {deadline ? (
          <>
            <p className="font-semibold">Closes {formatLocal(deadline, currentConfig().timeZone)} <span className="text-muted">your time</span></p>
            {app.deadline_tz && app.deadline_tz !== currentConfig().timeZone && (
              <p className="text-sm text-muted">Published as {formatLocal(deadline, app.deadline_tz)} {app.deadline_tz}</p>
            )}
            <p className="mt-1 text-sm">Your target: <span className="font-semibold text-gold">{app.summary.targetDay}</span> ({app.target_days_before} days early)</p>
          </>
        ) : (
          <p className="font-semibold">Rolling deadline — earlier is better.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Requirements {app.summary.progress.total > 0 && <span className="text-sm font-normal text-muted">{app.summary.progress.done}/{app.summary.progress.total}</span>}</h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {app.requirements.map((r) => (
            <li key={r.id}>
              <form action={toggleRequirementAction.bind(null, app.id, r.title, !r.done)}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-pressed={r.done}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${r.done ? "border-green text-green" : "border-line"}`} aria-hidden>{r.done ? "✓" : ""}</span>
                  <span className={r.done ? "text-muted line-through" : ""}>{r.title}</span>
                </button>
              </form>
            </li>
          ))}
          <li className="px-4 py-2">
            <form action={addRequirementAction.bind(null, app.id)} className="flex gap-2">
              <input name="title" placeholder="Add a requirement" className="flex-1 bg-transparent py-1.5" />
              <button className="text-sm font-semibold text-gold">Add</button>
            </form>
          </li>
        </ul>
        <p className="text-xs text-muted">Each requirement is a task on Today; ticking it here completes the task.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Status</h2>
        <div className="flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((s) => (
            <form key={s} action={setStatusAction.bind(null, app.id, s)}>
              <button aria-pressed={app.status === s} className={`rounded-full border px-3 py-1.5 text-sm ${app.status === s ? "border-gold bg-gold text-on-gold" : "border-line text-muted"}`}>{s}</button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
