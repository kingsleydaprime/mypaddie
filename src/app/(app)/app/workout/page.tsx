import Link from "next/link";
import { repsToPrefill } from "@/features/workouts/training";
import { WorkoutLogger, type PlannedExercise } from "@/features/workouts/ui/workout-logger";
import { workoutFor } from "@/features/workouts/workouts.repo";
import { requireDb } from "@/shared/supabase/session";

const describe = (e: { reps: number | null; weightKg: number | null; seconds: number | null; sets: number | null }) =>
  `${e.sets ?? "?"}×${e.seconds ? `${e.seconds}s` : e.reps ?? "?"}${e.weightKg ? ` @ ${e.weightKg}kg` : ""}`;

export default async function WorkoutPage() {
  const db = await requireDb("/app/workout");
  const today = await workoutFor(db, new Date());
  const session = today.workouts[0] ?? null;
  const done = session?.task?.status === "done";

  const exercises: PlannedExercise[] = (session?.exercises ?? []).map((e) => ({
    name: e.name,
    targetSets: e.sets,
    targetReps: e.reps,
    targetWeight: e.weightKg,
    targetSeconds: e.seconds,
    lastTime: e.lastTime ? describe(e.lastTime) : null,
    // Start from the target; last time's numbers are shown next to it to beat.
    prefill: { sets: e.sets, reps: repsToPrefill(e.reps), weightKg: e.weightKg, seconds: e.seconds },
  }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">{session ? session.name : "Workout"}</h1>
      </header>
      {!today.plan && <p className="text-sm text-muted">No training plan yet — tell Paddie your plan. You can still log something you did.</p>}
      {today.plan && !session && <p className="text-sm text-muted">Rest day on {today.plan}. Did something anyway? Log it.</p>}
      {done ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-muted">Today&apos;s session is already logged. Rest counts too.</p>
      ) : (
        <WorkoutLogger day={session?.name ?? null} defaultDuration={session?.durationMinutes ?? 45} exercises={exercises} />
      )}
    </div>
  );
}
