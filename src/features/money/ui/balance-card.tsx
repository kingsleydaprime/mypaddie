"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNaira } from "@/shared/format";

const KEY = "mypaddie.hideBalance";

/** OPay-style balance card. The eye hides the amount; the choice is remembered on this device. */
export function BalanceCard({ balance }: { balance: number }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a per-device preference after mount
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      // Storage unavailable (private mode): just show it.
    }
  }, []);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(KEY, h ? "0" : "1");
      } catch {}
      return !h;
    });

  return (
    <section className="rounded-3xl bg-gold p-5 text-on-gold shadow-sm">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z" /></svg>
          Available Balance
          <button type="button" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden} className="ml-1 opacity-80">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {hidden ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c5 0 9 5 10 8a13 13 0 0 1-3 4.1M6.6 6.6C4.3 8 2.7 10.2 2 12c1 3 5 8 10 8 1.6 0 3.1-.4 4.4-1.1" /> : <><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
            </svg>
          </button>
        </span>
        <Link href="/app/money/history" className="flex items-center gap-1">Transaction History <span aria-hidden>›</span></Link>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold tracking-tight" aria-live="polite">{hidden ? "₦ ••••••" : formatNaira(balance)}</p>
        <Link href="/app/money?add=in#quick-log" className="shrink-0 rounded-full bg-on-gold px-4 py-2.5 text-sm font-semibold text-gold">+ Add Money</Link>
      </div>
    </section>
  );
}
