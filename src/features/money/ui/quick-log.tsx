"use client";

import { useActionState, useState, useTransition } from "react";
import { currencySymbol, formatMoney } from "@/shared/format";
import { acceptSplitAction, logTransactionAction, type LogState } from "../money.actions";
import { flagMessage } from "./flag-copy";

const field = "w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted";
const CATEGORIES = ["food", "transport", "data", "rent", "family", "fun"];

function Toggle<T extends string>({ name, value, options, onChange }: { name: string; value: T | null; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <label key={o.v} className={`flex-1 cursor-pointer rounded-xl border px-3 py-3 text-center text-sm font-semibold ${value === o.v ? "border-gold bg-gold text-on-gold" : "border-line text-muted"}`}>
          <input type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function SplitCard({ state, currency }: { state: Extract<LogState, { ok: true }>; currency: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const p = state.proposedSplit!;
  const lines = [
    ["Needs", p.needs],
    ["Emergency buffer", p.buffer],
    ["Savings & investing", p.savings],
    ["Wants", p.wants],
    ["Flexible", p.flexible],
  ] as const;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="font-semibold">Proposed split for {formatMoney(state.amount, currency)}</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {lines.filter(([, v]) => v > 0).map(([k, v]) => (
          <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-medium">{formatMoney(v, currency)}</span></li>
        ))}
      </ul>
      {p.needsShort && <p className="mt-2 text-sm text-red">Not enough to cover this month&apos;s needs.</p>}
      {result ? (
        <p className="mt-3 text-sm font-semibold text-green" role="status">{result === "applied" ? "Done. Buckets topped up." : "Already split."}</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setResult(await acceptSplitAction(state.transactionId)))}
            className="rounded-xl bg-gold px-5 py-3 font-semibold text-on-gold disabled:opacity-60"
          >
            {pending ? "…" : "Accept"}
          </button>
          <span className="text-sm text-muted">Want it different? Tell Paddie in chat.</span>
        </div>
      )}
    </div>
  );
}

export function QuickLog({ initialDirection = "out", currency }: { initialDirection?: "out" | "in"; currency: string }) {
  const [direction, setDirection] = useState<"out" | "in">(initialDirection);
  const [tag, setTag] = useState<"need" | "want" | "unsure" | null>(null);
  const [category, setCategory] = useState("");
  const [state, action, pending] = useActionState<LogState, FormData>(async (prev, fd) => {
    const next = await logTransactionAction(prev, fd);
    if (next && "ok" in next) {
      setTag(null);
      setCategory("");
    }
    return next;
  }, null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">Quick log</h2>
      <form action={action} className="flex flex-col gap-3" key={state && "ok" in state ? state.transactionId : "form"}>
        <Toggle name="direction" value={direction} onChange={setDirection} options={[{ v: "out", label: "Money out" }, { v: "in", label: "Money in" }]} />
        <input name="amount" inputMode="numeric" placeholder={`${currencySymbol(currency)} amount`} required className={`${field} text-2xl font-bold`} />
        {direction === "out" && (
          <Toggle name="tag" value={tag} onChange={setTag} options={[{ v: "need", label: "Need" }, { v: "want", label: "Want" }, { v: "unsure", label: "Not sure" }]} />
        )}
        <input name="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={direction === "in" ? "From where? (salary, gig…)" : "For what?"} required className={field} />
        {direction === "out" && (
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} className="rounded-full border border-line px-3 py-1.5 text-sm text-muted">
                {c}
              </button>
            ))}
          </div>
        )}
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3.5 text-base font-semibold text-on-gold disabled:opacity-60">
          {pending ? "Logging…" : "Log it"}
        </button>
      </form>

      {state && "ok" in state && (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-sm font-semibold text-gold">Logged {formatMoney(state.amount, currency)} · +{state.xpEarned} XP for honesty</p>
          {state.flags.map((f) => (
            <p key={f.kind} className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm">{flagMessage(f, currency)}</p>
          ))}
          {state.proposedSplit && <SplitCard state={state} currency={currency} />}
        </div>
      )}
    </section>
  );
}
