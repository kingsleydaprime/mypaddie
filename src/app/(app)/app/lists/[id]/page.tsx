import Link from "next/link";
import { notFound } from "next/navigation";
import { addItemsAction, deleteListAction, removeItemAction, toggleItemAction } from "@/features/lists/lists.actions";
import { findList } from "@/features/lists/lists.repo";
import { requireDb } from "@/shared/supabase/session";

export default async function ListPage({ params }: PageProps<"/app/lists/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/lists/${id}`);
  const list = await findList(db, id);
  if (!list) notFound();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/lists" className="text-muted" aria-label="Back to lists">‹ Lists</Link>
      </header>
      <section>
        <h1 className="text-2xl font-bold">{list.title}</h1>
        {list.description && <p className="text-sm text-muted">{list.description}</p>}
        {list.showProgress && (
          <>
            <p className="mt-2 text-sm"><span className="text-2xl font-bold">{list.progress.percent}%</span> <span className="text-muted">· {list.progress.done} of {list.progress.total} done</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-gold" style={{ width: `${list.progress.percent}%` }} /></div>
          </>
        )}
        {list.bucket && <p className="mt-2 text-xs text-muted">Each first tick: +50 XP.</p>}
      </section>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {list.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            {list.showProgress ? (
              <form action={toggleItemAction.bind(null, list.id, i.id, !i.done)}>
                <button aria-pressed={i.done} aria-label={i.done ? `Untick ${i.text}` : `Tick off ${i.text}`}
                  className={`flex h-6 w-6 items-center justify-center rounded-md border ${i.done ? "border-green bg-green text-white" : "border-line"}`}>{i.done ? "✓" : ""}</button>
              </form>
            ) : <span className="text-gold" aria-hidden>●</span>}
            <span className={`min-w-0 flex-1 ${i.done ? "text-muted line-through" : ""}`}>{i.text}</span>
            <form action={removeItemAction.bind(null, list.id, i.id)}><button className="text-xs text-muted" aria-label={`Remove ${i.text}`}>✕</button></form>
          </li>
        ))}
        <li className="px-4 py-2">
          <form action={addItemsAction.bind(null, list.id)} className="flex gap-2">
            <input name="items" placeholder="Add an item" aria-label="Add an item" className="min-w-0 flex-1 bg-transparent py-1.5" />
            <button className="text-sm font-semibold text-gold">Add</button>
          </form>
        </li>
      </ul>
      <form action={deleteListAction.bind(null, list.id)}><button className="text-sm text-red">Delete this list</button></form>
    </div>
  );
}
