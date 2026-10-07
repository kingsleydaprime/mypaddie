"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/shared/format";
import { FEATURE_LABEL, LIMIT_LABEL, LIMITED, PLAN_INFO, PLANS, priceFor, type PlanId } from "../plans";
import { choosePlanAction, type ChooseState } from "../plans.actions";

export function PlanPicker({ current, currency, period: initialPeriod, student: initialStudent, paymentsEnabled }: {
  current: PlanId; currency: "USD" | "NGN"; period: "monthly" | "yearly"; student: boolean; paymentsEnabled: boolean;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [student, setStudent] = useState(initialStudent);
  const [state, action, pending] = useActionState<ChooseState, FormData>(choosePlanAction, null);
  const active = state && "ok" in state ? state.ok : current;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line p-1" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-sm ${period === p ? "bg-gold font-semibold text-on-gold" : "text-muted"}`}>
              {p === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={student} onChange={(e) => setStudent(e.target.checked)} className="accent-[var(--gold)]" />
          I&apos;m a student (half price)
        </label>
      </div>
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}

      {PLANS.map((id) => {
        const p = PLAN_INFO[id];
        const price = priceFor(id, currency, period, student);
        const isCurrent = active === id;
        return (
          <section key={id} className={`flex flex-col gap-3 rounded-2xl border p-4 ${isCurrent ? "border-gold bg-surface" : "border-line"}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold">{p.name}</h2>
              <p className="text-right">
                <span className="text-xl font-bold">{price === 0 ? "Free" : formatMoney(price, currency)}</span>
                {price > 0 && <span className="text-sm text-muted"> / {period === "monthly" ? "month" : "year"}</span>}
              </p>
            </div>
            <p className="-mt-2 text-sm text-muted">{p.tagline}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {LIMITED.map((l) => (
                <li key={l}>{p.limits[l] === null ? "Unlimited" : p.limits[l]} {LIMIT_LABEL[l]}</li>
              ))}
              {p.features.map((f) => (
                <li key={f}>✓ {FEATURE_LABEL[f]}{p.comingSoon?.includes(f) ? " (coming soon)" : ""}</li>
              ))}
            </ul>
            <form action={action}>
              <input type="hidden" name="plan" value={id} />
              <input type="hidden" name="period" value={period} />
              {student && <input type="hidden" name="student" value="on" />}
              <button disabled={pending || isCurrent} className={`w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-60 ${isCurrent ? "border border-gold text-gold" : "bg-gold text-on-gold"}`}>
                {isCurrent ? "Your plan" : paymentsEnabled && price > 0 ? `Choose ${p.name}` : `Switch to ${p.name}`}
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
