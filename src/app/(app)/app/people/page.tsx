import Link from "next/link";
import { addTopicAction, removePersonAction, talkedTodayAction } from "@/features/people/people.actions";
import { loadPeoplePicture } from "@/features/people/people.repo";
import { AddPersonForm } from "@/features/people/ui/add-person-form";
import { requireDb } from "@/shared/supabase/session";

const ago = (d: number | null) => (d === null ? "not yet" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);

export default async function PeoplePage() {
  const db = await requireDb("/app/people");
  const people = await loadPeoplePicture(db, new Date());
  const due = people.filter((p) => p.due).sort((a, b) => b.due!.overdueBy - a.due!.overdueBy);
  const birthdays = people.filter((p) => p.birthdayIn !== null && p.birthdayIn <= 14).sort((a, b) => a.birthdayIn! - b.birthdayIn!);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">People</h1>
      </header>

      {(due.length > 0 || birthdays.length > 0) && (
        <section className="flex flex-col gap-2 rounded-2xl border border-gold bg-surface p-4">
          {due.length > 0 && <p className="font-semibold">Due a check-in: {due.slice(0, 3).map((p) => p.name).join(", ")}</p>}
          {birthdays.map((p) => (
            <p key={p.id} className="text-sm">🎂 {p.name}&apos;s birthday {p.birthdayIn === 0 ? "is today" : `in ${p.birthdayIn} day${p.birthdayIn === 1 ? "" : "s"}`}</p>
          ))}
        </section>
      )}

      <AddPersonForm />
      {people.length === 0 && <p className="text-sm text-muted">The people who matter to you. Add a few, or tell Paddie about them as they come up.</p>}

      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}{p.close ? " ★" : ""}</p>
                <p className="text-xs text-muted">{p.who ?? p.relation} · last talked {ago(p.daysSince)}{p.reachOutEveryDays ? ` · every ${p.reachOutEveryDays}d` : ""}</p>
              </div>
              <form action={talkedTodayAction.bind(null, p.id)}>
                <button className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold ${p.due ? "bg-gold text-on-gold" : "border border-line"}`}>Talked today</button>
              </form>
            </div>
            {p.topics.length > 0 && <p className="mt-2 text-sm">Talk about: {p.topics.join(" · ")}</p>}
            {p.promises.length > 0 && <p className="mt-1 text-sm text-muted">You promised: {p.promises.map((x) => x.what).join(" · ")}</p>}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">More</summary>
              {p.notes && <p className="mt-2 text-sm">{p.notes}</p>}
              {p.recent.length > 0 && <p className="mt-2 text-xs text-muted">Recent: {p.recent.map((c) => `${c.on} ${c.how}${c.note ? ` — ${c.note}` : ""}`).join("; ")}</p>}
              <form action={addTopicAction.bind(null, p.id)} className="mt-2 flex gap-2">
                <input name="topic" maxLength={200} placeholder="Something to talk about next time" aria-label="Topic" className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm" />
                <button className="text-sm font-semibold text-gold">Add</button>
              </form>
              <form action={removePersonAction.bind(null, p.id)} className="mt-2">
                <button className="text-xs text-red">Remove {p.name}</button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
