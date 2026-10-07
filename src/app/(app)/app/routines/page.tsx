import Link from "next/link";
import { revalidatePath } from "next/cache";
import { loadRoutines, stopRoutine } from "@/features/routines/routines.repo";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

async function stopAction(id: string) {
  "use server";
  const db = await requireDb("/app/routines");
  await stopRoutine(db, id, new Date());
  revalidatePath("/app/routines");
}

export default async function RoutinesPage() {
  const db = await requireDb("/app/routines");
  const routines = await loadRoutines(db);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Routines</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">Habits that belong together, shown on Today as one item. Ask Paddie to make one: &ldquo;my morning routine is pray, read, brush, bath, dress — from 6am&rdquo;.</p>
      {routines.length === 0 && <p className="text-sm text-muted">None yet.</p>}
      {routines.map((r) => (
        <section key={r.id} className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">{r.title}</p>
          <ol className="mt-2 list-decimal pl-5 text-sm">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <form action={stopAction.bind(null, r.id)} className="mt-3">
            <SubmitButton className="text-sm text-red">Stop this routine</SubmitButton>
          </form>
        </section>
      ))}
    </div>
  );
}
