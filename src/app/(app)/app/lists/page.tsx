import Link from "next/link";
import { startBucketListAction } from "@/features/lists/lists.actions";
import { loadLists } from "@/features/lists/lists.repo";
import { CreateListForm } from "@/features/lists/ui/create-list-form";
import { requireDb } from "@/shared/supabase/session";

export default async function ListsPage() {
  const db = await requireDb("/app/lists");
  const lists = await loadLists(db);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">Lists</h1>
      </header>
      {!lists.some((l) => l.bucket) && (
        <form action={startBucketListAction} className="rounded-2xl border border-gold bg-surface p-4">
          <p className="font-semibold">Start your bucket list</p>
          <p className="mt-1 text-sm text-muted">Everything you want to do in this life. Each one you tick off is worth +50 XP.</p>
          <button className="mt-3 rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold">Start it</button>
        </form>
      )}
      <CreateListForm />
      <ul className="flex flex-col gap-2">
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/app/lists/${l.id}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{l.title}</span>
                <span className="shrink-0 text-sm text-muted">{l.showProgress ? `${l.progress.done}/${l.progress.total} · ${l.progress.percent}%` : `${l.progress.total} items`}</span>
              </div>
              {l.showProgress && l.progress.total > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={l.progress.percent} aria-label={`${l.progress.percent}% done`}>
                  <div className="h-full rounded-full bg-gold" style={{ width: `${l.progress.percent}%` }} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {lists.length === 0 && <p className="text-sm text-muted">Any list you want — or ask Paddie to make one for you.</p>}
    </div>
  );
}
