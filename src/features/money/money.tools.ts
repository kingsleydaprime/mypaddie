import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { transactionLoggedXp } from "@/features/xp/xp";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import type { Json } from "@/shared/supabase/database.types";
import { escapeLike } from "@/shared/supabase/like";
import { planDeficit } from "./deficit";
import { loadBudget, proposalFor, type BudgetContext } from "./money.repo";
import { flagSpend, judgePurchase } from "./purchase";

const naira = z.number().int().positive().describe("Whole naira");

function budgetSummary(b: BudgetContext) {
  const s = b.stage;
  return {
    stage: s.stage,
    ...(s.stage === "audit"
      ? { auditDay: s.day, daysLeft: s.daysLeft, loggedSoFar: s.totals }
      : { measuredDays: s.measured, income: s.totals.income, needs: s.totals.needs, wants: s.totals.wants, gap: Math.max(0, s.totals.gap), topLeaks: s.topLeaks }),
    buckets: b.buckets,
    thisMonth: { needsBudget: b.monthlyNeeds, spentOnNeeds: b.spentOnNeedsThisMonth, needsOutstanding: b.needsOutstanding },
  };
}

export function registerMoneyTools(server: McpServer) {
  server.registerTool(
    "log_transaction",
    {
      title: "Log transaction",
      description:
        "Record money in or out. Logging always earns XP, even for a dumb purchase — never shame him for logging. " +
        "Outflows need a tag: need, want, or unsure; for food and similar, ask 'basic version or the extra?' and " +
        "log two entries (need + want) if it's both. If `flags` comes back non-empty, point out the bad call " +
        "plainly and briefly (firm about the action, funny about the situation), then move on. For income, the " +
        "reply includes a proposed split — present it and ask him to accept, tweak, or reject (accept_split).",
      inputSchema: z.object({
        amount: naira,
        direction: z.enum(["in", "out"]),
        category: z.string().trim().min(1),
        tag: z.enum(["need", "want", "unsure"]).optional().describe("Required for out, ignored for in"),
        spend_level: z.enum(["floor", "comfortable"]).optional().describe("Needs only: cheapest honest version or current comfort"),
        item_id: z.uuid().optional(),
        note: z.string().optional(),
        at: z.iso.datetime({ offset: true }).optional().describe("When it happened, for backfilling. Default now"),
      }),
    },
    async (
      args: {
        amount: number;
        direction: "in" | "out";
        category: string;
        tag?: "need" | "want" | "unsure";
        spend_level?: "floor" | "comfortable";
        item_id?: string;
        note?: string;
        at?: string;
      },
      ctx: ToolContext,
    ) => {
      try {
        if (args.direction === "out" && !args.tag) return toolError("log_transaction: outflows need a tag (need, want or unsure)");
        const db = dbFrom(ctx);
        const now = new Date();
        const before = await loadBudget(db, now);
        const tag = args.direction === "out" ? args.tag! : null;

        const flags =
          tag === null
            ? []
            : flagSpend({ amount: args.amount, tag, stage: before.stage.stage, needsOutstanding: before.needsOutstanding, wantsLeft: before.buckets.wants });

        const xp = transactionLoggedXp();
        // Generated RPC types mark every argument non-null; the SQL function accepts
        // null for the optional ones, hence the casts below.
        const { data: id, error } = await db.rpc("record_transaction", {
          p_amount: args.amount,
          p_direction: args.direction,
          p_category: args.category,
          p_tag: tag as "need",
          p_spend_level: (tag === "need" ? args.spend_level ?? null : null) as "floor",
          p_item_id: (args.item_id ?? null) as string,
          p_note: (args.note ?? null) as string,
          p_at: (args.at ?? null) as string,
          p_xp: xp as unknown as Json,
        });
        if (error) return toolError(`log_transaction failed: ${error.message}`);

        return ok(
          await withMode(db, now, {
            transaction_id: id,
            xpEarned: xp.reduce((s, e) => s + e.amount, 0),
            flags,
            ...(args.direction === "in" ? { proposedSplit: proposalFor(args.amount, before) } : {}),
          }),
        );
      } catch (error) {
        return toolError(`log_transaction failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_money_status",
    {
      title: "Get money status",
      description:
        "Current money stage (audit → no judgement yet; deficit → needs exceed income; surplus → income covers " +
        "needs), bucket balances, and this month's needs. In deficit, includes the plan: income funds the cheapest " +
        "honest version of each need in priority order, plus the gap as one number and the hidden wants inside needs.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: Record<string, never>, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const budget = await loadBudget(db, now);
        const deficitPlan =
          budget.stage.stage === "deficit" ? planDeficit(budget.stage.totals.income, budget.needItems) : undefined;
        return ok(await withMode(db, now, { ...budgetSummary(budget), ...(deficitPlan ? { deficitPlan } : {}) }));
      } catch (error) {
        return toolError(`get_money_status failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "propose_split",
    {
      title: "Propose split",
      description:
        "Propose how an income entry is divided: outstanding needs first, then the emergency buffer, then the rest " +
        "split savings/wants/flexible (50/30/20 by default). A proposal only — nothing moves until accept_split.",
      inputSchema: z.object({ transaction_id: z.uuid().describe("The income entry from log_transaction") }),
      annotations: { readOnlyHint: true },
    },
    async ({ transaction_id }: { transaction_id: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { data: tx, error } = await db.from("transactions").select("amount, direction, split_applied_at").eq("id", transaction_id).maybeSingle();
        if (error) return toolError(`propose_split failed: ${error.message}`);
        if (!tx || tx.direction !== "in") return toolError("propose_split: that isn't an income entry");
        if (tx.split_applied_at) return toolError("propose_split: this income has already been split");
        return ok(await withMode(db, now, { income: tx.amount, proposedSplit: proposalFor(tx.amount, await loadBudget(db, now)) }));
      } catch (error) {
        return toolError(`propose_split failed: ${(error as Error).message}`);
      }
    },
  );

  const amounts = z.object({
    needs: z.number().int().nonnegative(),
    buffer: z.number().int().nonnegative(),
    savings: z.number().int().nonnegative(),
    wants: z.number().int().nonnegative(),
    flexible: z.number().int().nonnegative(),
  });

  server.registerTool(
    "accept_split",
    {
      title: "Accept split",
      description:
        "Move an income entry into the buckets. Omit `amounts` to accept the proposal as-is, or pass his tweaked " +
        "amounts — they must add up to the income exactly. Each income can only be split once.",
      inputSchema: z.object({ transaction_id: z.uuid(), amounts: amounts.optional() }),
    },
    async (args: { transaction_id: string; amounts?: z.infer<typeof amounts> }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const { data: tx, error } = await db.from("transactions").select("amount, direction").eq("id", args.transaction_id).maybeSingle();
        if (error) return toolError(`accept_split failed: ${error.message}`);
        if (!tx || tx.direction !== "in") return toolError("accept_split: that isn't an income entry");

        let split = args.amounts;
        if (!split) {
          const p = proposalFor(tx.amount, await loadBudget(db, now));
          split = { needs: p.needs, buffer: p.buffer, savings: p.savings, wants: p.wants, flexible: p.flexible };
        }
        const total = Object.values(split).reduce((a, b) => a + b, 0);
        if (total !== tx.amount) return toolError(`accept_split: amounts add up to ${total}, but the income is ${tx.amount}`);

        const { data: result, error: rpcError } = await db.rpc("apply_split", { p_transaction_id: args.transaction_id, p_amounts: split });
        if (rpcError) return toolError(`accept_split failed: ${rpcError.message}`);
        const after = await loadBudget(db, now);
        return ok(await withMode(db, now, { result, applied: split, buckets: after.buckets }));
      } catch (error) {
        return toolError(`accept_split failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "check_purchase",
    {
      title: "Check purchase",
      description:
        "The don't-buy-this check, for when he says 'I want to buy X'. You judge two things: is it really a need " +
        "in disguise, and does it serve one of his goals (give the goal's title, from list_items tier=goal). The " +
        "engine checks the money. Answer clearly with the verdict: yes, wait 24 hours, or no — and be honest, " +
        "not agreeable. Asking again about the same item after 24 hours can turn a wait into a yes.",
      inputSchema: z.object({
        item: z.string().trim().min(1),
        price: naira,
        need_in_disguise: z.boolean(),
        serves_goal: z.string().optional().describe("Title of the goal it serves, if any"),
      }),
    },
    async (args: { item: string; price: number; need_in_disguise: boolean; serves_goal?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const budget = await loadBudget(db, now);

        // The earliest "wait" on this item in the last two weeks starts the 24-hour clock.
        const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
        const { data: waits, error } = await db
          .from("purchase_checks")
          .select("decided_at")
          .ilike("item", escapeLike(args.item))
          .eq("verdict", "wait_24h")
          .gte("decided_at", since)
          .order("decided_at", { ascending: true })
          .limit(1);
        if (error) return toolError(`check_purchase failed: ${error.message}`);

        const decision = judgePurchase({
          price: args.price,
          stage: budget.stage.stage,
          needInDisguise: args.need_in_disguise,
          servesGoal: args.serves_goal ?? null,
          needsOutstanding: budget.needsOutstanding,
          wantsLeft: budget.buckets.wants,
          waitingSince: waits[0] ? new Date(waits[0].decided_at) : null,
          now,
        });

        const { error: saveError } = await db.from("purchase_checks").insert({
          item: args.item,
          price: args.price,
          verdict: decision.verdict,
          reasons: decision.reasons as unknown as Json[],
        });
        if (saveError) return toolError(`check_purchase failed: ${saveError.message}`);

        return ok(await withMode(db, now, { item: args.item, price: args.price, ...decision }));
      } catch (error) {
        return toolError(`check_purchase failed: ${(error as Error).message}`);
      }
    },
  );
}
