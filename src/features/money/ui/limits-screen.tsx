import Link from "next/link";
import { currencySymbol, formatMoney } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { SubmitButton } from "@/shared/ui/submit-button";
import { addBillAction, addDebtAction, payBillAction, payDebtAction, setBillStatusAction, setCapAction } from "../guardrails.actions";
import { loadBills, loadCaps, loadDebts } from "../guardrails.repo";

const field = "rounded-xl border border-line bg-surface px-3 py-3 text-base placeholder:text-muted";
const card = "rounded-2xl border border-line bg-surface px-4 py-3";
const EVERY = { once: "one-off", week: "weekly", month: "monthly", year: "yearly" } as const;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Bills and payments due (subscriptions, trials, one-offs), spending caps and money owed, on one page off Money. */
export async function LimitsScreen({ db, error }: { db: Db; error: string | null }) {
  const now = new Date();
  const [caps, bills, debts] = await Promise.all([loadCaps(db, now), loadBills(db, now), loadDebts(db, now)]);
  const owe = debts.debts.filter((d) => d.direction === "i_owe");
  const owed = debts.debts.filter((d) => d.direction === "owed_to_me");
  const sym = currencySymbol();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link href="/app/money" className="text-muted" aria-label="Back to money">‹ Money</Link>
        <h1 className="text-2xl font-bold">Bills, subscriptions &amp; debts</h1>
      </header>
      {error && <p className="rounded-xl border border-red px-4 py-3 text-sm text-red" role="alert">{error}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline justify-between text-lg font-bold">
          Bills <span className="text-sm font-medium text-muted">{formatMoney(bills.monthlyTotal)}/mo</span>
        </h2>
        {bills.subscriptions.count > 0 && (
          <p className="text-sm text-muted">
            Subscriptions you could drop: {bills.subscriptions.count} · {formatMoney(bills.subscriptions.monthly)}/mo · <span className="font-medium text-text">{formatMoney(bills.subscriptions.yearly)} a year</span>
          </p>
        )}
        {bills.bills.length === 0 && <p className="text-sm text-muted">Data, rent, subscriptions, a fee due once — add them once, get reminded each time.</p>}
        <ul className="flex flex-col gap-2">
          {bills.bills.map((b) => {
            const due = bills.dueSoon.find((d) => d.id === b.id);
            return (
              <li key={b.id} className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.title} <span className="font-normal text-muted">· {formatMoney(b.amount)}</span></p>
                    <p className={`text-sm ${due?.overdue ? "text-red" : "text-muted"}`}>
                      {b.status === "paused" ? (
                        `Paused · ${EVERY[b.every]}`
                      ) : b.trialEndsOn ? (
                        <><span className="font-medium text-gold">Free trial until {day(b.trialEndsOn)}</span> · then {EVERY[b.every]}</>
                      ) : (
                        `${due?.overdue ? "Overdue since" : "Due"} ${day(b.nextDue)} · ${EVERY[b.every]}`
                      )}
                      {b.tag === "want" ? " · want" : ""}
                    </p>
                  </div>
                  {b.status === "active" && !b.trialEndsOn && (
                    <form action={payBillAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="due" value={b.nextDue} />
                      <SubmitButton className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${due ? "bg-gold text-on-gold" : "border border-line"}`}>Paid</SubmitButton>
                    </form>
                  )}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted">More</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.every !== "once" && (
                      <form action={setBillStatusAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value={b.status === "paused" ? "active" : "paused"} />
                        <SubmitButton className="rounded-xl border border-line px-3 py-2 text-sm font-medium">{b.status === "paused" ? "Resume" : "Pause"}</SubmitButton>
                      </form>
                    )}
                    <form action={setBillStatusAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="status" value="ended" />
                      <SubmitButton className="rounded-xl border border-line px-3 py-2 text-sm font-medium">
                        {b.every === "once" ? "Don't owe it any more" : b.trialEndsOn ? "Cancelled the trial" : "Cancelled it"}
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">+ Add a bill, subscription or payment</summary>
          <form action={addBillAction} className="mt-3 grid grid-cols-2 gap-2">
            <input name="title" required placeholder="Data, rent, Netflix…" className={`${field} col-span-2`} />
            <input name="amount" required inputMode="numeric" placeholder={`Amount ${sym}`} className={field} />
            <select name="every" defaultValue="month" className={field} aria-label="How often">
              <option value="once">Once</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Next due
              <input name="first_due" type="date" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Free trial ends (optional)
              <input name="trial_ends_on" type="date" className={field} />
            </label>
            <p className="col-span-2 -mt-1 text-xs text-muted">On a free trial, leave &ldquo;next due&rdquo; empty: the first charge is when the trial ends, and you&rsquo;ll be asked to keep or cancel two days before.</p>
            <select name="tag" defaultValue="need" className={field} aria-label="Need or want">
              <option value="need">Need</option>
              <option value="want">Want</option>
            </select>
            <input name="category" placeholder="Category (optional)" className={field} />
            <SubmitButton className="col-span-2 rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Add bill</SubmitButton>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Spending caps</h2>
        {caps.length === 0 && <p className="text-sm text-muted">Your own monthly limit per category. Paddie holds you to it.</p>}
        <ul className="flex flex-col gap-2">
          {caps.map((c) => (
            <li key={c.category} className={card}>
              <p className="flex items-baseline justify-between font-semibold">
                {c.category}
                <span className={`text-sm font-medium ${c.over ? "text-red" : "text-muted"}`}>
                  {formatMoney(c.spent)} / {formatMoney(c.cap)}
                </span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={c.used} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.category} cap used`}>
                <div className={`h-full ${c.over ? "bg-red" : "bg-gold"}`} style={{ width: `${Math.min(100, c.used)}%` }} />
              </div>
              <p className="mt-1 text-sm text-muted">{c.over ? `Over by ${formatMoney(c.spent - c.cap)}` : `${formatMoney(c.left)} left this month`}</p>
            </li>
          ))}
        </ul>
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">Set or change a cap</summary>
          <form action={setCapAction} className="mt-3 grid grid-cols-2 gap-2">
            <input name="category" required placeholder="Food, Data…" className={field} />
            <input name="cap" inputMode="numeric" placeholder={`${sym} a month`} className={field} />
            <p className="col-span-2 text-xs text-muted">Leave the amount empty to remove a cap.</p>
            <SubmitButton className="col-span-2 rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Save cap</SubmitButton>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Money owed</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className={card}>
            <p className="text-sm text-muted">You owe</p>
            <p className="text-xl font-bold">{formatMoney(debts.iOwe)}</p>
          </div>
          <div className={card}>
            <p className="text-sm text-muted">Owed to you</p>
            <p className="text-xl font-bold">{formatMoney(debts.owedToMe)}</p>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {[...owe, ...owed].map((d) => {
            const late = d.dueOn !== null && debts.overdue.some((o) => o.person === d.person && o.dueOn === d.dueOn && o.left === d.left);
            return (
              <li key={d.id} className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {d.direction === "i_owe" ? `You owe ${d.person}` : `${d.person} owes you`} <span className="font-normal text-muted">· {formatMoney(d.left)}</span>
                    </p>
                    <p className={`text-sm ${late ? "text-red" : "text-muted"}`}>
                      {[d.reason, d.dueOn && `${late ? "was due" : "due"} ${day(d.dueOn)}`, d.paid > 0 && `${formatMoney(d.paid)} paid`].filter(Boolean).join(" · ") || "No date"}
                    </p>
                  </div>
                  <form action={payDebtAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <SubmitButton className="rounded-xl border border-line px-3 py-2.5 text-sm font-semibold">{d.direction === "i_owe" ? "Paid back" : "Got it back"}</SubmitButton>
                  </form>
                </div>
                <form action={payDebtAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input name="amount" inputMode="numeric" placeholder={`Part payment ${sym}`} className={`${field} min-w-0 flex-1 py-2 text-sm`} />
                  <SubmitButton className="rounded-xl border border-line px-3 py-2 text-sm font-medium">Record</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">+ Borrowed or lent money</summary>
          <form action={addDebtAction} className="mt-3 grid grid-cols-2 gap-2">
            <select name="direction" defaultValue="i_owe" className={`${field} col-span-2`} aria-label="Which way">
              <option value="i_owe">I borrowed (I owe them)</option>
              <option value="owed_to_me">I lent (they owe me)</option>
            </select>
            <input name="person" required placeholder="Who?" className={field} />
            <input name="amount" required inputMode="numeric" placeholder={`Amount ${sym}`} className={field} />
            <input name="reason" placeholder="What for? (optional)" className={`${field} col-span-2`} />
            <label className="col-span-2 flex flex-col gap-1 text-sm text-muted">
              Pay back by (optional)
              <input name="due_on" type="date" className={field} />
            </label>
            <p className="col-span-2 text-xs text-muted">The money moves your balance now, as a loan — not income or spending.</p>
            <SubmitButton className="col-span-2 rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Save</SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}
