import Link from "next/link";
import type { Db } from "@/shared/supabase/token-client";
import { SubmitButton } from "@/shared/ui/submit-button";
import { addMilestoneAction } from "../life.actions";
import { loadLifeMap, loadTimeline } from "../life.repo";

const STATE = {
  good: { dot: "bg-green", word: "Doing well" },
  okay: { dot: "bg-muted", word: "Steady" },
  attention: { dot: "bg-red", word: "Needs attention" },
  unknown: { dot: "border border-line", word: "Nothing logged yet" },
} as const;
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-base placeholder:text-muted";

/** The whole life on one page: seven areas, one focus, and the timeline. */
export async function LifeScreen({ db, message }: { db: Db; message: string | null }) {
  const now = new Date();
  const [map, line] = await Promise.all([loadLifeMap(db, now), loadTimeline(db, now)]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link href="/app/stats" className="text-muted" aria-label="Back to stats">‹ Stats</Link>
        <h1 className="text-2xl font-bold">Your life</h1>
      </header>
      {message && <p className="rounded-xl border border-line px-4 py-3 text-sm" role="status">{message}</p>}

      {map.focus && (
        <section className="rounded-2xl border border-gold px-4 py-3">
          <p className="text-sm text-muted">This week, give attention to</p>
          <p className="text-lg font-bold">{map.focus.label}</p>
          <p className="text-sm">{map.focus.why.join(" · ")}</p>
        </section>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {map.areas.map((a) => (
          <li key={a.area} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="flex items-center gap-2 font-semibold">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATE[a.state].dot}`} aria-hidden />
              {a.label}
              <span className="ml-auto text-sm font-normal text-muted">{STATE[a.state].word}</span>
            </p>
            {a.facts.length > 0 && (
              <ul className="mt-1 text-sm text-muted">
                {a.facts.map((f) => <li key={f.text}>{f.text}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Timeline</h2>
        {line.length === 0 && <p className="text-sm text-muted">The big moments — graduating, a first job, a move — and the milestones still ahead.</p>}
        <ol className="flex flex-col border-l border-line pl-4">
          {line.map((e) => (
            <li key={e.id} className="relative py-2">
              <span className={`absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full ${e.when === "past" ? "bg-gold" : e.when === "overdue" ? "bg-red" : "border border-gold bg-bg"}`} aria-hidden />
              <p className="text-sm text-muted">{e.date ?? "Someday"}{e.item ? ` · ${e.item}` : ""}</p>
              <p className="font-semibold">{e.title}</p>
              {(e.before || e.after) && (
                <p className="text-sm text-muted">{[e.before && `Before: ${e.before}`, e.after && `After: ${e.after}`].filter(Boolean).join(" · ")}</p>
              )}
            </li>
          ))}
        </ol>
        <details className="rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">+ Add a moment</summary>
          <form action={addMilestoneAction} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="kind" value="moment" />
            <input type="hidden" name="back" value="/app/life" />
            <input name="title" required placeholder="Graduated, first job, moved to Lagos…" className={field} />
            <label className="flex flex-col gap-1 text-sm text-muted">
              When (past or planned)
              <input name="date" type="date" className={field} />
            </label>
            <textarea name="before" rows={2} placeholder="What life looked like before (optional)" className={field} />
            <textarea name="after" rows={2} placeholder="What changed after (optional)" className={field} />
            <SubmitButton className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Add to the timeline</SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}
