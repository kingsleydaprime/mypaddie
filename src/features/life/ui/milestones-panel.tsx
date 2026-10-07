import { PILLARS } from "@/shared/domain";
import type { Db } from "@/shared/supabase/token-client";
import { SubmitButton } from "@/shared/ui/submit-button";
import { achieveMilestoneAction, addMilestoneAction } from "../life.actions";
import { loadMilestones } from "../life.repo";

const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-base placeholder:text-muted";
const label = (p: string) => p[0]!.toUpperCase() + p.slice(1);

/** Milestones under a goal or dream, on its quest page: hit them, add more. */
export async function MilestonesPanel({ db, itemId, ask }: { db: Db; itemId: string; ask: string | null }) {
  const milestones = await loadMilestones(db, itemId);
  const back = `/app/quests/${itemId}`;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">Milestones</h2>
      <p className="text-sm text-muted">Checkpoints on the way. Each one pays 3× when you hit it.</p>
      <ul className="flex flex-col gap-2">
        {milestones.map((m) => (
          <li key={m.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{m.title}{m.status === "achieved" ? " ✓" : ""}</p>
                {m.date && <p className="text-sm text-muted">{m.status === "achieved" ? "Hit" : "By"} {m.date}</p>}
              </div>
              {m.status === "planned" && ask !== m.id && (
                <form action={achieveMilestoneAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold">Hit it</SubmitButton>
                </form>
              )}
            </div>
            {ask === m.id && (
              <form action={achieveMilestoneAction} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="back" value={back} />
                <select name="pillar" required className={`${field} min-w-0 flex-1 text-sm`} aria-label="Which part of life it served">
                  {PILLARS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
                <SubmitButton className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-on-gold">Claim</SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={addMilestoneAction} className="flex gap-2">
        <input type="hidden" name="kind" value="milestone" />
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="back" value={back} />
        <input name="title" required placeholder="Next milestone" className={`${field} min-w-0 flex-1`} />
        <input name="date" type="date" className={`${field} w-36`} aria-label="By when (optional)" />
        <SubmitButton className="rounded-xl border border-line px-3 py-2 text-sm font-medium">Add</SubmitButton>
      </form>
    </section>
  );
}
