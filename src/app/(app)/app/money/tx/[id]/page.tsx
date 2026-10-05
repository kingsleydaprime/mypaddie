import Link from "next/link";
import { notFound } from "next/navigation";
import { EditTransactionForm, VoidTransactionForm } from "@/features/money/ui/history-forms";
import { DEFAULT_CONFIG } from "@/shared/config";
import { formatNaira } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";
import { formatLocal } from "@/shared/time";

export default async function TransactionPage({ params }: PageProps<"/app/money/tx/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/money/tx/${id}`);
  const { data: t } = await db
    .from("transactions")
    .select("id, amount, direction, category, tag, note, kind, at, voided_at, void_reason, split_applied_at")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/money/history" className="text-muted" aria-label="Back to history">‹ History</Link>
        <h1 className="text-2xl font-bold">Entry</h1>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className={`text-3xl font-bold ${t.direction === "in" ? "text-green" : ""} ${t.voided_at ? "line-through opacity-60" : ""}`}>
          {t.direction === "in" ? "+" : "−"}{formatNaira(t.amount)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {formatLocal(new Date(t.at), DEFAULT_CONFIG.timeZone)} · {t.kind === "normal" ? t.tag ?? "income" : t.kind === "opening" ? "opening balance" : "correction"}
        </p>
        {t.voided_at && <p className="mt-2 text-sm text-red">Voided{t.void_reason ? `: ${t.void_reason}` : ""}. It stays on the record but doesn&apos;t count.</p>}
      </section>
      {!t.voided_at && (
        <>
          <EditTransactionForm id={t.id} note={t.note ?? ""} category={t.category} />
          {t.split_applied_at ? (
            <p className="text-sm text-muted">This income was already split into your buckets, so it can&apos;t be voided here.</p>
          ) : (
            <VoidTransactionForm id={t.id} />
          )}
        </>
      )}
    </div>
  );
}
