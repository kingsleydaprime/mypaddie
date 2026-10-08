import Link from "next/link";
import { revalidatePath } from "next/cache";
import { loadRoutines, stopRoutine } from "@/features/routines/routines.repo";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RoutineSteps } from "@/features/today/ui/routine-steps";
import { currentConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";

async function stopAction(id: string) {
  "use server";
  const db = await requireDb("/app/routines");
  await stopRoutine(db, id, new Date());
  revalidatePath("/app/routines");
}

export default async function RoutinesPage() {
  const db = await requireDb("/app/routines");
  const routines = await loadRoutines(db);
  // Today's step rows, so they can be ticked here as well as on Today.
  const { data: todayRows } = await db
    .from("tasks")
    .select("id, title, status, routine_id, routine_step")
    .not("routine_id", "is", null)
    .eq("occurs_on", dayKey(new Date(), currentConfig().timeZone))
    .neq("status", "cancelled")
    .order("routine_step");
  const todayOf = (id: string) => (todayRows ?? []).filter((t) => t.routine_id === id).map((t) => ({ id: t.id, title: t.title, done: t.status === "done" }));
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/tasks" className="text-muted" aria-label="Back to tasks">‹ Tasks</Link>
        <h1 className="text-2xl font-bold">Routines</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">Habits that belong together, shown on Today as one item. Ask Paddie to make one: &ldquo;my morning routine is pray, read, brush, bath, dress — from 6am&rdquo;.</p>
      {routines.length === 0 && <p className="text-sm text-muted">None yet.</p>}
      {routines.map((r) => (
        <section key={r.id} className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">{r.title}</p>
          {todayOf(r.id).length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted">Today · tap a step to tick it off</p>
              <RoutineSteps steps={todayOf(r.id)} />
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Not on today</p>
              <ol className="mt-2 list-decimal pl-5 text-sm">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </>
          )}
          <form action={stopAction.bind(null, r.id)} className="mt-3">
            <SubmitButton className="text-sm text-red">Stop this routine</SubmitButton>
          </form>
        </section>
      ))}
    </div>
  );
}
