import { DEFAULT_CONFIG } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { computeMoneyStage, type MoneyStage, type TransactionForMoney } from "./stage";
import type { NeedForDeficit } from "./deficit";
import { monthlyNeedsTotal, needsOutstanding } from "./purchase";
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
    db.from("transactions").select("amount").eq("direction", "out").in("tag", ["need", "unsure"]).gte("at", monthStart),
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
