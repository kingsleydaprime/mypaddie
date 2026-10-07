import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = ["You", "Your AI", "Reminders", "Start"];

/** "Step 2 of 4" with a bar, the step's content, then Continue / Skip. */
export function Step({ n, title, children, next, nextLabel = "Continue", skip }: { n: number; title: string; children: ReactNode; next: string; nextLabel?: string; skip?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-gold uppercase">Step {n} of {STEPS.length} · {STEPS[n - 1]}</p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < n ? "bg-gold" : "bg-surface-2"}`} />)}
        </div>
        <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      </div>
      {children}
      <div className="flex flex-col gap-2">
        <Link href={next} className="rounded-xl bg-gold px-4 py-3.5 text-center font-semibold text-on-gold">{nextLabel}</Link>
        {skip && <Link href={skip} className="text-center text-sm text-muted">Skip for now</Link>}
      </div>
    </div>
  );
}
