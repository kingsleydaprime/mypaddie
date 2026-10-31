"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { StepStatus } from "@/features/routines/routines";
import { planRoutineFinish } from "@/features/routines/routines";
import { finishRoutineAction } from "../today.actions";

/**
 * A routine card's Done: finishes the routine for its day. If any step isn't
 * ticked, a popup lists them first — open ones will be marked missed, skipped
 * ones (already explained) are just closed.
 */
export function FinishRoutineButton({ routine, steps }: {
  routine: string;
  steps: { id: string; title: string; status: StepStatus }[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, run] = useTransition();
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = planRoutineFinish(steps);
  const toMiss = steps.filter((s) => plan.miss.includes(s.id));
  const toClose = steps.filter((s) => plan.cancel.includes(s.id));

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const finish = () =>
    run(async () => {
      const r = await finishRoutineAction(steps.map((s) => s.id));
      if (r.result !== "finished") return setError("Couldn't finish it");
      setOpen(false);
      setLabel(r.missed ? `Finished · ${r.missed} missed` : "Finished");
      setTimeout(() => router.refresh(), 900);
    });

  if (label) return <span className="flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold text-gold" role="status">{label}</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => (toMiss.length + toClose.length > 0 ? setOpen(true) : finish())}
        disabled={pending}
        aria-label={`Finish "${routine}"`}
        className="flex-1 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold shadow-sm disabled:opacity-60"
      >
        {pending ? "…" : "Done"}
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        aria-labelledby="finish-routine-title"
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-text shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2 id="finish-routine-title" className="text-lg font-bold">Finish {routine}?</h2>
            <p className="mt-1 text-sm text-muted">
              {toMiss.length > 0
                ? `${toMiss.length === 1 ? "This step isn't" : `These ${toMiss.length} steps aren't`} ticked, so ${toMiss.length === 1 ? "it'll" : "they'll"} be marked missed. That costs XP; owning it earns a little back.`
                : "Everything left was skipped with a reason, so it's just closed."}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5 text-sm">
            {toMiss.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-red" aria-hidden />
                <span className="truncate">{s.title}</span>
                <span className="ml-auto shrink-0 text-xs text-red">missed</span>
              </li>
            ))}
            {toClose.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 text-muted">
                <span className="size-2 shrink-0 rounded-full bg-line" aria-hidden />
                <span className="truncate">{s.title}</span>
                <span className="ml-auto shrink-0 text-xs">skipped, no penalty</span>
              </li>
            ))}
          </ul>

          {error && <p className="text-sm text-red" role="alert">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">
              Keep going
            </button>
            <button type="button" onClick={finish} disabled={pending} className="flex-1 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-on-gold disabled:opacity-60">
              {pending ? "…" : "Finish routine"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
