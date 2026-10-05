import Link from "next/link";
import type { Db } from "@/shared/supabase/token-client";
import { byCategory, shoppingList } from "../pantry";
import { loadPantry, recentMeals } from "../pantry.repo";
import { AddPantryItem } from "./add-item";
import { PantryItemRow } from "./pantry-item";

const label = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const fmt = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, ""));

export async function PantryScreen({ db }: { db: Db }) {
  const now = new Date();
  const [items, meals] = await Promise.all([loadPantry(db), recentMeals(db, 7, now)]);
  const list = shoppingList(items);
  const stocked = byCategory(items);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link href="/money" className="text-muted" aria-label="Back to money">‹ Money</Link>
        <h1 className="text-2xl font-bold">Pantry</h1>
      </header>

      {list.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">Shopping list</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {list.map((e) => (
              <li key={e.name} className="flex justify-between">
                <span>{e.name}</span>
                <span className={e.reason === "out" ? "text-red" : "text-gold"}>{e.reason === "out" ? "out" : `${fmt(e.quantity)} ${e.unit} left`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddPantryItem />

      {stocked.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          Nothing here yet. Add items above, or tell Paddie what you bought: &ldquo;5kg rice, a crate of eggs, 3 tins of tomato paste&rdquo;.
        </p>
      ) : (
        stocked.map(([category, xs]) => (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{label(category)}</h2>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {xs.map((i) => (
                <PantryItemRow key={i.name} item={i} />
              ))}
            </ul>
          </section>
        ))
      )}

      {meals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Eaten this week</h2>
          <p className="text-sm text-muted">{meals.map((m) => m.name).join(" · ")}</p>
        </section>
      )}

      <p className="text-center text-sm text-muted">Ask Paddie &ldquo;what can I cook?&rdquo;</p>
    </div>
  );
}
