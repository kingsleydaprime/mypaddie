import { DEFAULT_CONFIG } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { computeMoneyStage, type MoneyStage, type TransactionForMoney } from "./stage";
import type { NeedForDeficit } from "./deficit";
import { balanceOf, correctionFor } from "./balance";
import { flagSpend, monthlyNeedsTotal, needsOutstanding } from "./purchase";
import { transactionLoggedXp } from "@/features/xp/xp";
import type { Json } from "@/shared/supabase/database.types";
import { DEFAULT_SPLIT, proposeWaterfall, validateSplit, type SplitPercentages } from "./waterfall";
import { startOfMonth } from "@/shared/time";

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
    // Opening balances, corrections and voided entries never count as income or spending.
    db.from("transactions").select(columns).eq("kind", "normal").is("voided_at", null).order("at", { ascending: true }).limit(1),
    db.from("transactions").select(columns).eq("kind", "normal").is("voided_at", null).gte("at", since).lte("at", now.toISOString()),
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

export type BucketName = "needs" | "buffer" | "savings" | "wants" | "flexible";

export interface BudgetContext {
  stage: MoneyStage;
  buckets: Record<BucketName, number>;
  needItems: NeedForDeficit[];
  monthlyNeeds: number;
  spentOnNeedsThisMonth: number;
  needsOutstanding: number;
  split: SplitPercentages;
  bufferTarget: number;
}

function parseSplit(value: unknown): SplitPercentages {
  const v = value as Partial<SplitPercentages> | null;
  if (v && typeof v.savings === "number" && typeof v.wants === "number" && typeof v.flexible === "number") {
    const split = { savings: v.savings, wants: v.wants, flexible: v.flexible };
    try {
      validateSplit(split);
      return split;
    } catch {
      // A bad saved setting falls back to the default rather than breaking every money tool.
    }
  }
  return DEFAULT_SPLIT;
}

/** Everything the money tools reason about, loaded in one go. */
export async function loadBudget(db: Db, now: Date, config = DEFAULT_CONFIG): Promise<BudgetContext> {
  const monthStart = startOfMonth(now, config.timeZone).toISOString();
  const [stage, buckets, needs, spent, settings] = await Promise.all([
    loadMoneyStage(db, now, config),
    db.from("buckets").select("name, balance"),
    db.from("items").select("id, title, priority, floor_amount, comfortable_amount").eq("tier", "need").eq("status", "active"),
    db.from("transactions").select("amount").eq("kind", "normal").is("voided_at", null).eq("direction", "out").in("tag", ["need", "unsure"]).gte("at", monthStart),
    db.from("settings").select("key, value").in("key", ["split_pct", "buffer_target"]),
  ]);
  for (const res of [buckets, needs, spent, settings]) {
    if (res.error) throw new Error(`loading budget: ${res.error.message}`);
  }

  const balances: Record<BucketName, number> = { needs: 0, buffer: 0, savings: 0, wants: 0, flexible: 0 };
  for (const b of buckets.data!) balances[b.name] = b.balance;

  const needItems: NeedForDeficit[] = needs.data!.map((n) => ({
    id: n.id,
    title: n.title,
    priority: n.priority,
    floor: n.floor_amount ?? n.comfortable_amount ?? 0,
    comfortable: n.comfortable_amount ?? n.floor_amount ?? 0,
  }));
  const monthlyNeeds = monthlyNeedsTotal(
    needs.data!.map((n) => ({ floor: n.floor_amount, comfortable: n.comfortable_amount })),
  );
  const spentOnNeedsThisMonth = spent.data!.reduce((s, t) => s + t.amount, 0);

  const setting = (key: string) => settings.data!.find((s) => s.key === key)?.value;
  const savedBuffer = setting("buffer_target");

  return {
    stage,
    buckets: balances,
    needItems,
    monthlyNeeds,
    spentOnNeedsThisMonth,
    needsOutstanding: needsOutstanding(monthlyNeeds, spentOnNeedsThisMonth, balances.needs),
    split: parseSplit(setting("split_pct")),
    // Default emergency buffer: one month of needs.
    bufferTarget: typeof savedBuffer === "number" && savedBuffer >= 0 ? savedBuffer : monthlyNeeds,
  };
}

/** The waterfall for one income entry, given the current budget. */
export function proposalFor(income: number, budget: BudgetContext) {
  return proposeWaterfall({
    income,
    // Needs still to fund this month, beyond what the needs bucket already holds.
    needsOutstanding: budget.needsOutstanding,
    bufferBalance: budget.buckets.buffer,
    bufferTarget: budget.bufferTarget,
    split: budget.split,
  });
}

export interface NewTransaction {
  amount: number;
  direction: "in" | "out";
  category: string;
  tag: "need" | "want" | "unsure" | null;
  spendLevel?: "floor" | "comfortable" | null;
  itemId?: string | null;
  note?: string | null;
  /** ISO time it happened, for backfilling; default now. */
  at?: string | null;
}

/**
 * Logs money in or out. Spending is judged against the budget as it stood
 * *before* this entry (flags), the matching bucket is drawn down and the
 * logging XP paid atomically, and income comes back with a proposed split.
 */
export async function logTransaction(db: Db, tx: NewTransaction, now: Date) {
  if (tx.direction === "out" && !tx.tag) throw new Error("outflows need a tag (need, want or unsure)");
  const before = await loadBudget(db, now);
  const tag = tx.direction === "out" ? tx.tag : null;
  const flags =
    tag === null
      ? []
      : flagSpend({ amount: tx.amount, tag, stage: before.stage.stage, needsOutstanding: before.needsOutstanding, wantsLeft: before.buckets.wants });

  const xp = transactionLoggedXp();
  // Generated RPC types mark every argument non-null; the SQL function accepts
  // null for the optional ones, hence the casts.
  const { data: id, error } = await db.rpc("record_transaction", {
    p_amount: tx.amount,
    p_direction: tx.direction,
    p_category: tx.category,
    p_tag: tag as "need",
    p_spend_level: (tag === "need" ? tx.spendLevel ?? null : null) as "floor",
    p_item_id: (tx.itemId ?? null) as string,
    p_note: (tx.note ?? null) as string,
    p_at: (tx.at ?? null) as string,
    p_xp: xp as unknown as Json,
  });
  if (error) throw new Error(`logging the transaction: ${error.message}`);

  return {
    transactionId: id,
    xpEarned: xp.reduce((s, e) => s + e.amount, 0),
    flags,
    proposedSplit: tx.direction === "in" ? proposalFor(tx.amount, before) : null,
  };
}

export type SplitAmounts = Record<BucketName, number>;

/** Moves an income entry into the buckets — the proposal, or his tweak. Once per income. */
export async function acceptSplit(db: Db, transactionId: string, now: Date, amounts?: SplitAmounts) {
  const { data: tx, error } = await db.from("transactions").select("amount, direction").eq("id", transactionId).maybeSingle();
  if (error) throw new Error(`loading the income: ${error.message}`);
  if (!tx || tx.direction !== "in") throw new Error("that isn't an income entry");

  let split = amounts;
  if (!split) {
    const p = proposalFor(tx.amount, await loadBudget(db, now));
    split = { needs: p.needs, buffer: p.buffer, savings: p.savings, wants: p.wants, flexible: p.flexible };
  }
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  if (total !== tx.amount) throw new Error(`the amounts add up to ${total}, but the income is ${tx.amount}`);

  const { data: result, error: rpcError } = await db.rpc("apply_split", { p_transaction_id: transactionId, p_amounts: split });
  if (rpcError) throw new Error(`applying the split: ${rpcError.message}`);
  return { result: result as "applied" | "already_applied" | "not_found", applied: split };
}

// ─── Balance, history, corrections ─────────────────────────────────────────

export async function loadBalance(db: Db): Promise<{ balance: number; hasHistory: boolean }> {
  const { data, error } = await db.from("transactions").select("amount, direction, voided_at");
  if (error) throw new Error(`loading balance: ${error.message}`);
  return {
    balance: balanceOf(data.map((t) => ({ amount: t.amount, direction: t.direction, voided: t.voided_at !== null }))),
    hasHistory: data.some((t) => t.voided_at === null),
  };
}

/** Make the balance match what's really in his account. */
export async function setBalance(db: Db, actual: number, now: Date) {
  const { balance, hasHistory } = await loadBalance(db);
  const correction = correctionFor(actual, balance, hasHistory);
  if (!correction) return { result: "unchanged" as const, balance };
  const { error } = await db.from("transactions").insert({
    amount: correction.amount,
    direction: correction.direction,
    category: correction.kind === "opening" ? "Opening balance" : "Balance correction",
    kind: correction.kind,
    at: now.toISOString(),
  });
  if (error) throw new Error(`setting the balance: ${error.message}`);
  return { result: "set" as const, balance: actual, recorded: correction };
}

export async function listTransactions(db: Db, opts: { limit?: number; includeVoided?: boolean } = {}) {
  let q = db
    .from("transactions")
    .select("id, amount, direction, category, tag, note, kind, at, voided_at, void_reason, split_applied_at")
    .order("at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (!opts.includeVoided) q = q.is("voided_at", null);
  const { data, error } = await q;
  if (error) throw new Error(`loading transactions: ${error.message}`);
  return data;
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

/** Void a mistake: stays on the record, stops counting, money back in its bucket, logging XP taken back. */
export async function voidTransaction(db: Db, id: string, reason: string | null) {
  const reversal = transactionLoggedXp().map((e) => ({ ...e, amount: -e.amount, note: "voided" }));
  const { data, error } = await db.rpc("void_transaction", { p_id: id, p_reason: (reason ?? null) as string, p_xp_reversal: reversal as unknown as Json });
  if (error) throw new Error(`voiding: ${error.message}`);
  return data as "voided" | "already_voided" | "split_applied" | "not_found";
}

/** Narration and category can change; amount and tag can't (they already moved bucket money). */
export async function editTransaction(db: Db, id: string, changes: { note?: string | null; category?: string }) {
  const { data, error } = await db
    .from("transactions")
    .update({
      ...(changes.note !== undefined ? { note: changes.note?.trim() || null } : {}),
      ...(changes.category ? { category: changes.category.trim() } : {}),
    })
    .eq("id", id)
    .is("voided_at", null)
    .select("id");
  if (error) throw new Error(`editing: ${error.message}`);
  return data.length ? ("updated" as const) : ("not_found" as const);
}

export async function setPurchaseInterest(db: Db, id: string, interest: "interested" | "not_interested" | "bought") {
  const { data, error } = await db
    .from("purchase_checks")
    .update({ interest, interest_changed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`updating the purchase check: ${error.message}`);
  return data.length ? ("updated" as const) : ("not_found" as const);
}
