import Link from "next/link";
import { listTransactions, loadBalance } from "@/features/money/money.repo";
import { SetBalanceForm } from "@/features/money/ui/history-forms";
import { currentConfig } from "@/shared/config";
import { formatMoney } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";
import { dayKey, localTimeOf } from "@/shared/time";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;

export default async function HistoryPage() {
  const db = await requireDb("/app/money/history");
  const [rows, { balance }] = await Promise.all([listTransactions(db, { limit: 200, includeVoided: true }), loadBalance(db)]);
  const days = [...new Set(rows.map((r) => dayKey(new Date(r.at), tz())))];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/money" className="text-muted" aria-label="Back to money">‹ Money</Link>
        <h1 className="text-2xl font-bold">History</h1>
      </header>
      <p className="text-sm text-muted">Balance now: <span className="font-semibold text-text">{formatMoney(balance)}</span></p>
      <SetBalanceForm currency={currentConfig().currency} />
      {rows.length === 0 && <p className="text-sm text-muted">Nothing logged yet.</p>}
      {days.map((day) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">
            {new Intl.DateTimeFormat("en-GB", { timeZone: tz(), weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`))}
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {rows.filter((r) => dayKey(new Date(r.at), tz()) === day).map((r) => (
              <li key={r.id}>
                <Link href={`/app/money/tx/${r.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 ${r.voided_at ? "opacity-50" : ""}`}>
                  <div className="min-w-0">
                    <p className={`truncate ${r.voided_at ? "line-through" : ""}`}>{r.note || r.category}</p>
                    <p className="text-xs text-muted">
                      {localTimeOf(new Date(r.at), tz())} · {r.note ? `${r.category} · ` : ""}
                      {r.kind !== "normal" ? (r.kind === "opening" ? "opening balance" : "correction") : r.tag ?? "income"}
                      {r.voided_at && " · voided"}
                    </p>
                  </div>
                  <span className={`shrink-0 font-semibold ${r.direction === "in" ? "text-green" : ""}`}>
                    {r.direction === "in" ? "+" : "−"}{formatMoney(r.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
