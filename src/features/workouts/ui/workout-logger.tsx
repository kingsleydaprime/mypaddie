"use client";

import { useState, useTransition } from "react";
import { logWorkoutAction, type LogWorkoutResult } from "../workouts.actions";

export interface PlannedExercise {
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: number | null;
  targetSeconds: number | null;
  lastTime: string | null;
  prefill: { sets: number | null; reps: number | null; weightKg: number | null; seconds: number | null };
}

interface Row {
  name: string;
  done: boolean;
  sets: string;
  reps: string;
  weightKg: string;
  seconds: string;
  planned?: PlannedExercise;
}

const str = (n: number | null) => (n === null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const cell = "w-full rounded-lg border border-line bg-surface-2 px-2 py-2 text-center text-base";

export function WorkoutLogger({ day, defaultDuration, exercises }: { day: string | null; defaultDuration: number; exercises: PlannedExercise[] }) {
  const [rows, setRows] = useState<Row[]>(
    exercises.map((e) => ({ name: e.name, done: true, sets: str(e.prefill.sets), reps: str(e.prefill.reps), weightKg: str(e.prefill.weightKg), seconds: str(e.prefill.seconds), planned: e })),
  );
  const [duration, setDuration] = useState(String(defaultDuration));
  const [feel, setFeel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<LogWorkoutResult | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (result && "ok" in result) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-center" role="status">
        <p className="text-lg font-bold text-gold">Logged{result.xp ? ` · +${result.xp} XP` : ""}</p>
        {result.newBests.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {result.newBests.map((b) => (
              <li key={b.exercise}>
                <span className="font-semibold">New best — {b.exercise}:</span> {b.from} → {b.to}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Session in the books. Next time, one more rep.</p>
        )}
      </div>
    );
  }

  const submit = () =>
    start(async () => {
      const entries = rows
        .filter((r) => r.done && r.name.trim())
        .map((r) => ({ exercise: r.name.trim(), sets: num(r.sets), reps: num(r.reps), weightKg: num(r.weightKg), seconds: num(r.seconds) }));
      setResult(await logWorkoutAction({ day, durationMinutes: Number(duration), feel, notes, entries }));
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const timed = r.planned ? r.planned.targetSeconds !== null : false;
          return (
            <li key={i} className={`rounded-2xl border border-line bg-surface p-3 ${r.done ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={r.done} onChange={(e) => update(i, { done: e.target.checked })} className="h-5 w-5" aria-label={`Did ${r.name || "this exercise"}`} />
                {r.planned ? (
                  <span className="flex-1 font-semibold">{r.name}</span>
                ) : (
                  <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Exercise" className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5" />
                )}
              </div>
              {r.planned && (
                <p className="mt-1 text-xs text-muted">
                  Target {r.planned.targetSets ?? "?"}×{r.planned.targetSeconds ? `${r.planned.targetSeconds}s` : r.planned.targetReps ?? "?"}
                  {r.planned.targetWeight ? ` @ ${r.planned.targetWeight}kg` : ""}
                  {r.planned.lastTime && <span className="text-gold"> · last: {r.planned.lastTime}</span>}
                </p>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <label>Sets<input inputMode="numeric" value={r.sets} onChange={(e) => update(i, { sets: e.target.value })} className={cell} /></label>
                {timed ? (
                  <label>Seconds<input inputMode="numeric" value={r.seconds} onChange={(e) => update(i, { seconds: e.target.value })} className={cell} /></label>
                ) : (
                  <label>Reps<input inputMode="numeric" value={r.reps} onChange={(e) => update(i, { reps: e.target.value })} className={cell} /></label>
                )}
                <label>Kg<input inputMode="decimal" value={r.weightKg} onChange={(e) => update(i, { weightKg: e.target.value })} placeholder="—" className={cell} /></label>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setRows((rs) => [...rs, { name: "", done: true, sets: "", reps: "", weightKg: "", seconds: "" }])} className="rounded-xl border border-dashed border-line px-4 py-2.5 text-muted">
        + Add exercise
      </button>

      <label className="flex items-center justify-between text-sm text-muted">
        Minutes
        <input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-24 rounded-lg border border-line bg-surface-2 px-3 py-2 text-center text-base" />
      </label>
      <div className="flex items-center justify-between text-sm text-muted">
        How did it feel?
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setFeel(n)} aria-pressed={feel === n} className={`h-9 w-9 rounded-lg border ${feel === n ? "border-gold bg-gold text-on-gold" : "border-line"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="rounded-xl border border-line bg-surface px-4 py-3" />

      {result && "error" in result && <p className="text-sm text-red" role="alert">{result.error}</p>}
      <button type="button" disabled={pending || !Number(duration)} onClick={submit} className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold disabled:opacity-60">
        {pending ? "Saving…" : "Save workout"}
      </button>
    </div>
  );
}
