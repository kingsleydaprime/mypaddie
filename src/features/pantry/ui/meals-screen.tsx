import Link from "next/link";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";
import { acceptMealsAction, removeMealAction } from "../meals.actions";
import { loadMealPlan, proposeMealPlan } from "../meals.repo";

const card = "rounded-2xl border border-line bg-surface px-4 py-3";
const small = "rounded-xl border border-line px-3 py-2 text-sm font-medium";
const DAYS = 3;

const dayLabel = (day: string, today: string) =>
  day === today ? "Today" : new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
const qty = (n: number, unit: string) => `${n} ${unit}`;

/** The next few days of meals: what's planned, a proposal for the rest, and what to buy. */
export async function MealsScreen({ db, exclude }: { db: Db; exclude: string[] }) {
  const now = new Date();
  const today = dayKey(now, currentConfig().timeZone);
  const [planned, proposal] = await Promise.all([loadMealPlan(db, today, DAYS), proposeMealPlan(db, now, { days: DAYS, exclude })]);
  const toAccept = proposal.meals.map((m) => ({ day: m.day, slot: m.slot, name: m.name, recipeId: m.recipeId }));
  const notThis = (name: string) => `/app/pantry/meals?not=${encodeURIComponent([...exclude, name].join(","))}`;

  const days = [...new Set([...planned.map((p) => p.day), ...proposal.meals.map((m) => m.day)])].sort();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/pantry" className="text-muted" aria-label="Back to pantry">‹ Pantry</Link>
        <h1 className="text-2xl font-bold">Meal plan</h1>
      </header>

      {proposal.hint && <p className={`${card} text-sm text-muted`}>{proposal.hint} Ask Paddie: “save my jollof recipe”.</p>}

      {days.map((day) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{dayLabel(day, today)}</h2>
          <ul className="flex flex-col gap-2">
            {planned.filter((p) => p.day === day).map((p) => (
              <li key={p.id} className={`${card} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <p className="text-sm text-muted">{p.slot}</p>
                  <p className="truncate font-semibold">{p.name}{p.status === "cooked" ? " ✓" : ""}</p>
                </div>
                {p.status === "planned" && (
                  <form action={removeMealAction}>
                    <input type="hidden" name="day" value={p.day} />
                    <input type="hidden" name="slot" value={p.slot} />
                    <SubmitButton className={small}>Clear</SubmitButton>
                  </form>
                )}
              </li>
            ))}
            {proposal.meals.filter((m) => m.day === day).map((m) => (
              <li key={`${m.day}-${m.slot}`} className="rounded-2xl border border-dashed border-gold px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">{m.slot} · suggested</p>
                    <p className="truncate font-semibold">{m.name}</p>
                    <p className={`text-sm ${m.makeable ? "text-green" : "text-muted"}`}>
                      {m.makeable ? "You have everything" : `Missing: ${m.missing.map((i) => i.name).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <form action={acceptMealsAction}>
                      <input type="hidden" name="meals" value={JSON.stringify([{ day: m.day, slot: m.slot, name: m.name, recipeId: m.recipeId }])} />
                      <SubmitButton className={small}>Yes</SubmitButton>
                    </form>
                    <Link href={notThis(m.name)} className={`${small} text-center text-muted`}>Not this</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {proposal.unfilled.length > 0 && (
        <p className="text-sm text-muted">
          No recipe suits {proposal.unfilled.length} meal{proposal.unfilled.length === 1 ? "" : "s"} yet. Save recipes with Paddie and they&apos;ll appear here.
        </p>
      )}

      {toAccept.length > 1 && (
        <form action={acceptMealsAction}>
          <input type="hidden" name="meals" value={JSON.stringify(toAccept)} />
          <SubmitButton className="w-full rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold">Accept all {toAccept.length} suggestions</SubmitButton>
        </form>
      )}
      {exclude.length > 0 && <Link href="/app/pantry/meals" className="text-center text-sm text-muted">Show turned-down dishes again</Link>}

      {proposal.shopping.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">To buy for these</h2>
          <ul className={`${card} flex flex-col gap-1 text-sm`}>
            {proposal.shopping.map((i) => (
              <li key={`${i.name}-${i.unit}`} className="flex justify-between"><span>{i.name}</span><span className="text-muted">{qty(i.quantity, i.unit)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
