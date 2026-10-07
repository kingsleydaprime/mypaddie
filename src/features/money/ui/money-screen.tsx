import Link from "next/link";
import { currentConfig } from "@/shared/config";
import { formatMoney } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { planDeficit } from "../deficit";
import { loadBalance, loadBudget, type BucketName } from "../money.repo";
import { purchaseInterestAction } from "../money.history.actions";
import { BalanceCard } from "./balance-card";
import { QuickLog } from "./quick-log";

const BUCKETS: { name: BucketName; label: string }[] = [
  { name: "needs", label: "Needs" },
  { name: "buffer", label: "Buffer" },
  { name: "savings", label: "Savings" },
  { name: "wants", label: "Wants" },
  { name: "flexible", label: "Flexible" },
];

const VERDICT = { yes: { label: "Yes", cls: "text-green" }, wait_24h: { label: "Wait 24h", cls: "text-gold" }, no: { label: "No", cls: "text-red" } } as const;

export async function MoneyScreen({ db, addMoney = false }: { db: Db; addMoney?: boolean }) {
  const now = new Date();
  const [budget, recent, checks, { balance }] = await Promise.all([
    loadBudget(db, now),
    db.from("transactions").select("id, amount, direction, category, tag, note, at").is("voided_at", null).order("at", { ascending: false }).limit(6),
    db.from("purchase_checks").select("id, item, price, verdict, decided_at, interest").order("decided_at", { ascending: false }).limit(8),
    loadBalance(db),
  ]);
  // Not-interested checks sink to the bottom, greyed — kept, not hidden.
  const sortedChecks = [...(checks.data ?? [])].sort((a, b) => Number(a.interest === "not_interested") - Number(b.interest === "not_interested"));
  const s = budget.stage;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Money</h1>
        <Link href="/app/pantry" className="rounded-xl border border-line px-4 py-2 text-sm font-medium">Pantry ›</Link>
      </header>

      <BalanceCard balance={balance} currency={currentConfig().currency} />

      <section className="rounded-2xl border border-line bg-surface p-5">
        {s.stage === "audit" ? (
          <>
            <p className="text-sm font-medium text-gold">{s.day === 0 ? "Audit · starts with your first log" : `Audit · day ${s.day} of 30`}</p>
            <p className="mt-1 text-lg font-semibold">No budgets, no judgement. Just log everything.</p>
            <p className="mt-2 text-sm text-muted">
              So far: in {formatMoney(s.totals.income)} · needs {formatMoney(s.totals.needs)} · wants {formatMoney(s.totals.wants)}
            </p>
          </>
        ) : s.stage === "deficit" ? (
          <>
            <p className="text-sm font-medium text-red">Deficit</p>
            <p className="mt-1 text-3xl font-bold">{formatMoney(s.totals.gap)} gap</p>
            <p className="mt-2 text-sm text-muted">Needs {formatMoney(s.totals.needs)} · income {formatMoney(s.totals.income)}. Two levers: raise income or lower needs.</p>
            {(() => {
              const plan = planDeficit(s.totals.income, budget.needItems);
              return plan.hiddenWants > 0 ? (
                <p className="mt-2 text-sm text-muted">{formatMoney(plan.hiddenWants)} of your needs is comfort above the cheapest honest version.</p>
              ) : null;
            })()}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-green">Surplus</p>
            <p className="mt-1 text-3xl font-bold">{formatMoney(-s.totals.gap)} left over</p>
            <p className="mt-2 text-sm text-muted">Needs {formatMoney(s.totals.needs)} · income {formatMoney(s.totals.income)}</p>
          </>
        )}
        {s.stage !== "audit" && s.topLeaks.length > 0 && (
          <p className="mt-3 text-sm text-muted">Top leaks: {s.topLeaks.map((l) => `${l.category} ${formatMoney(l.amount)}`).join(" · ")}</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        {BUCKETS.map((b) => (
          <div key={b.name} className={`rounded-2xl border border-line bg-surface p-4 ${b.name === "needs" ? "col-span-2" : ""}`}>
            <p className="text-sm text-muted">{b.label}</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(budget.buckets[b.name])}</p>
          </div>
        ))}
      </section>

      {budget.monthlyNeeds > 0 && (
        <p className="text-sm text-muted">
          This month: needs {formatMoney(budget.monthlyNeeds)} · spent {formatMoney(budget.spentOnNeedsThisMonth)} ·{" "}
          <span className={budget.needsOutstanding > 0 ? "text-red" : "text-green"}>
            {budget.needsOutstanding > 0 ? `${formatMoney(budget.needsOutstanding)} still to fund` : "covered"}
          </span>
        </p>
      )}

      <div id="quick-log" className="scroll-mt-4">
        <QuickLog initialDirection={addMoney ? "in" : "out"} currency={currentConfig().currency} />
      </div>

      {(recent.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline justify-between text-lg font-bold">
            Recent <Link href="/app/money/history" className="text-sm font-medium text-muted">See all ›</Link>
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {recent.data!.map((t) => (
              <li key={t.id}>
                <Link href={`/app/money/tx/${t.id}`} className="flex items-center justify-between px-4 py-3">
                  <span className="min-w-0 truncate">
                    {t.note || t.category}
                    {t.tag && <span className="ml-2 text-xs text-muted">{t.tag}</span>}
                  </span>
                  <span className={`shrink-0 font-semibold ${t.direction === "in" ? "text-green" : ""}`}>
                    {t.direction === "in" ? "+" : "−"}
                    {formatMoney(t.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sortedChecks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Purchase checks</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {sortedChecks.map((c) => {
              const dropped = c.interest === "not_interested";
              return (
                <li key={c.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${dropped ? "opacity-50" : ""}`}>
                  <span className="min-w-0">
                    <span className={dropped ? "line-through" : ""}>{c.item}</span> <span className="text-sm text-muted">{formatMoney(c.price)}</span>
                    <span className="block text-xs">
                      {dropped ? <span className="text-muted">not interested</span> : c.interest === "bought" ? <span className="text-muted">bought</span> : <span className={VERDICT[c.verdict].cls}>{VERDICT[c.verdict].label}</span>}
                    </span>
                  </span>
                  {c.interest !== "bought" && (
                    <form action={purchaseInterestAction.bind(null, c.id, dropped ? "interested" : "not_interested")}>
                      <button className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-muted">{dropped ? "Interested again" : "Not interested"}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
