"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/shared/format";
import { FEATURE_LABEL, limitText, LIMITED, PLAN_INFO, PLANS, priceFor } from "../plans";

/** Public pricing: the same plans and prices the app enforces (plans.ts). */
export function PricingTable() {
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const toggle = "rounded-lg px-3 py-1.5 text-sm";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line p-1" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
              className={`${toggle} ${period === p ? "bg-gold font-semibold text-on-gold" : "text-muted"}`}>
              {p === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl border border-line p-1" role="group" aria-label="Currency">
          {(["NGN", "USD"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}
              className={`${toggle} ${currency === c ? "bg-gold font-semibold text-on-gold" : "text-muted"}`}>
              {c === "NGN" ? "₦ Naira" : "$ Dollars"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((id) => {
          const p = PLAN_INFO[id];
          const price = priceFor(id, currency, period, false);
          const featured = id === "plus";
          return (
            <section key={id} className={`flex flex-col gap-4 rounded-3xl border p-6 ${featured ? "border-gold bg-surface" : "border-line"}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">{p.name}</h2>
                  {featured && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-on-gold">Most people</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              </div>
              <p>
                <span className="text-3xl font-bold">{formatMoney(price, currency)}</span>
                <span className="text-muted"> / {period === "monthly" ? "month" : "year"}</span>
              </p>
              <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                {LIMITED.map((l) => (
                  <li key={l}><span className="text-gold">●</span> {limitText(l, p.limits[l])}</li>
                ))}
                {p.features.map((f) => (
                  <li key={f}><span className="text-gold">✓</span> {FEATURE_LABEL[f]}{p.comingSoon?.includes(f) ? " (coming soon)" : ""}</li>
                ))}
              </ul>
              <Link href="/signup" className={`rounded-full px-5 py-3 text-center font-semibold ${featured ? "bg-gold text-on-gold" : "border border-line"}`}>
                {id === "free" ? "Start free" : `Start with ${p.name}`}
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
