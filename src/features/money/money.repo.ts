import { DEFAULT_CONFIG } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { computeMoneyStage, type MoneyStage, type TransactionForMoney } from "./stage";

type TxRow = { amount: number; direction: "in" | "out"; tag: "need" | "want" | "unsure" | null; category: string; at: string };

const toTx = (r: TxRow): TransactionForMoney => ({ ...r, at: new Date(r.at) });

/**
 * The stage only needs the very first transaction (to place day 1) and the
 * last two periods (the complete one that decides, plus the current one),
 * so this never loads your whole history.
 */
export async function loadMoneyStage(db: Db, now: Date, config = DEFAULT_CONFIG): Promise<MoneyStage> {
  const since = new Date(now.getTime() - (2 * config.money.periodDays + 1) * 86_400_000).toISOString();
  const columns = "amount, direction, tag, category, at";
  const [first, recent] = await Promise.all([
    db.from("transactions").select(columns).order("at", { ascending: true }).limit(1),
    db.from("transactions").select(columns).gte("at", since).lte("at", now.toISOString()),
  ]);
  if (first.error) throw new Error(`loading first transaction: ${first.error.message}`);
  if (recent.error) throw new Error(`loading transactions: ${recent.error.message}`);

  // The first transaction only anchors day 1; if it's also in the recent
  // window, adding it again would count it twice.
  // (Compare as dates: Postgres writes "+00:00", JS writes "Z".)
  const anchor = (first.data as TxRow[]).filter((r) => Date.parse(r.at) < Date.parse(since));
  const rows = [...anchor, ...(recent.data as TxRow[])];
  return computeMoneyStage(rows.map(toTx), now, config);
}
