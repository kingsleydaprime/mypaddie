import { formatNaira } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { planDeficit } from "../deficit";
import { loadBudget, type BucketName } from "../money.repo";
import { QuickLog } from "./quick-log";

const BUCKETS: { name: BucketName; label: string }[] = [
  { name: "needs", label: "Needs" },
  { name: "buffer", label: "Buffer" },
  { name: "savings", label: "Savings" },
  { name: "wants", label: "Wants" },
  { name: "flexible", label: "Flexible" },
];

const VERDICT = { yes: { label: "Yes", cls: "text-green" }, wait_24h: { label: "Wait 24h", cls: "text-gold" }, no: { label: "No", cls: "text-red" } } as const;

export async function MoneyScreen({ db }: { db: Db }) {
  const now = new Date();
  const [budget, recent, checks] = await Promise.all([
    loadBudget(db, now),
    db.from("transactions").select("id, amount, direction, category, tag, at").order("at", { ascending: false }).limit(8),
    db.from("purchase_checks").select("id, item, price, verdict, decided_at").order("decided_at", { ascending: false }).limit(5),
  ]);
  const s = budget.stage;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Money</h1>

      <section className="rounded-2xl border border-line bg-surface p-5">
        {s.stage === "audit" ? (
          <>
            <p className="text-sm font-medium text-gold">{s.day === 0 ? "Audit · starts with your first log" : `Audit · day ${s.day} of 30`}</p>
            <p className="mt-1 text-lg font-semibold">No budgets, no judgement. Just log everything.</p>
            <p className="mt-2 text-sm text-muted">
              So far: in {formatNaira(s.totals.income)} · needs {formatNaira(s.totals.needs)} · wants {formatNaira(s.totals.wants)}
            </p>
          </>
        ) : s.stage === "deficit" ? (
          <>
            <p className="text-sm font-medium text-red">Deficit</p>
            <p className="mt-1 text-3xl font-bold">{formatNaira(s.totals.gap)} gap</p>
            <p className="mt-2 text-sm text-muted">Needs {formatNaira(s.totals.needs)} · income {formatNaira(s.totals.income)}. Two levers: raise income or lower needs.</p>
            {(() => {
              const plan = planDeficit(s.totals.income, budget.needItems);
              return plan.hiddenWants > 0 ? (
                <p className="mt-2 text-sm text-muted">{formatNaira(plan.hiddenWants)} of your needs is comfort above the cheapest honest version.</p>
              ) : null;
            })()}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-green">Surplus</p>
            <p className="mt-1 text-3xl font-bold">{formatNaira(-s.totals.gap)} left over</p>
            <p className="mt-2 text-sm text-muted">Needs {formatNaira(s.totals.needs)} · income {formatNaira(s.totals.income)}</p>
          </>
        )}
        {s.stage !== "audit" && s.topLeaks.length > 0 && (
          <p className="mt-3 text-sm text-muted">Top leaks: {s.topLeaks.map((l) => `${l.category} ${formatNaira(l.amount)}`).join(" · ")}</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        {BUCKETS.map((b) => (
          <div key={b.name} className={`rounded-2xl border border-line bg-surface p-4 ${b.name === "needs" ? "col-span-2" : ""}`}>
            <p className="text-sm text-muted">{b.label}</p>
            <p className="mt-1 text-xl font-bold">{formatNaira(budget.buckets[b.name])}</p>
          </div>
        ))}
      </section>

      {budget.monthlyNeeds > 0 && (
        <p className="text-sm text-muted">
          This month: needs {formatNaira(budget.monthlyNeeds)} · spent {formatNaira(budget.spentOnNeedsThisMonth)} ·{" "}
          <span className={budget.needsOutstanding > 0 ? "text-red" : "text-green"}>
            {budget.needsOutstanding > 0 ? `${formatNaira(budget.needsOutstanding)} still to fund` : "covered"}
          </span>
        </p>
      )}

      <QuickLog />

      {(recent.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Recent</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {recent.data!.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  {t.category}
                  {t.tag && <span className="ml-2 text-xs text-muted">{t.tag}</span>}
                </span>
                <span className={`font-semibold ${t.direction === "in" ? "text-green" : ""}`}>
                  {t.direction === "in" ? "+" : "−"}
                  {formatNaira(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(checks.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Purchase checks</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {checks.data!.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  {c.item} <span className="text-sm text-muted">{formatNaira(c.price)}</span>
                </span>
                <span className={`font-semibold ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
