import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { addBill, addDebt, forgiveDebt, loadBills, loadCaps, loadDebts, payBill, payDebt, setCap, updateBill } from "./guardrails.repo";

const amount = z.number().int().positive();
const category = z.string().trim().min(1).max(60);
const date = z.iso.date();

/** Each tool: run, wrap with the mode, and turn a throw into a readable tool error. */
function run<A>(name: string, fn: (args: A, ctx: ToolContext, now: Date) => Promise<Record<string, unknown>>) {
  return async (args: A, ctx: ToolContext) => {
    try {
      const db = dbFrom(ctx);
      const now = new Date();
      return ok(await withMode(db, now, await fn(args, ctx, now)));
    } catch (error) {
      return toolError(`${name} failed: ${(error as Error).message}`);
    }
  };
}

export function registerGuardrailTools(server: McpServer) {
  server.registerTool(
    "set_cap",
    {
      title: "Set spending cap",
      description:
        "A monthly limit for one spending category, in their words (\"food: 40k a month\"). Categories match " +
        "log_transaction's, any case. log_transaction flags a spend that breaks it and check_purchase says no to one " +
        "that would. null removes the cap. Caps are their rule: hold them to it, don't renegotiate it for them.",
      inputSchema: z.object({ category, monthly_cap: amount.nullable() }),
    },
    run("set_cap", async (args: { category: string; monthly_cap: number | null }, ctx) => ({ ...(await setCap(dbFrom(ctx), args.category, args.monthly_cap)) })),
  );

  server.registerTool(
    "list_caps",
    {
      title: "Spending caps",
      description: "Each cap with this month's spending, what's left and the share used.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run("list_caps", async (_a: Record<string, never>, ctx, now) => ({ caps: await loadCaps(dbFrom(ctx), now) })),
  );

  server.registerTool(
    "add_bill",
    {
      title: "Add recurring bill",
      description:
        "A bill that comes round: data, rent, a subscription, school fees. `every` week, month or year from `first_due` " +
        "(a bill on the 31st lands on the last day of shorter months). Each due date becomes a 'Pay: …' task with " +
        "reminders; pay it with pay_bill. Tag 'need' (default) or 'want' — a subscription they could drop is a want. " +
        "Link item_id when it's the bill behind a need from list_items.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(100),
        amount,
        every: z.enum(["week", "month", "year"]),
        first_due: date.describe("YYYY-MM-DD, the next date it's due"),
        category: category.optional().describe("Defaults to the title"),
        tag: z.enum(["need", "want"]).optional(),
        item_id: z.uuid().optional(),
      }),
    },
    run("add_bill", async (a: { title: string; amount: number; every: "week" | "month" | "year"; first_due: string; category?: string; tag?: "need" | "want"; item_id?: string }, ctx, now) => ({
      ...(await addBill(dbFrom(ctx), { title: a.title, amount: a.amount, every: a.every, firstDue: a.first_due, category: a.category, tag: a.tag, itemId: a.item_id }, now)),
    })),
  );

  server.registerTool(
    "pay_bill",
    {
      title: "Pay bill",
      description:
        "They paid a bill (by title or id). Logs the spend (bucket and XP like any spend), ticks its task and moves it to " +
        "the next due date. Pass `amount` if it cost something different this time. Paying the same due date twice " +
        "pays once. If it was paid in the last half-period the result is 'recently_paid' and nothing happens: it's " +
          "probably a repeat — only if they really are paying the next one early, call again with ahead=true. If it's " +
          "overdue by more than one period, each call pays the oldest.",
      inputSchema: z.object({ bill: z.string().trim().min(1), amount: amount.optional(), paid_on: date.optional(), ahead: z.boolean().optional() }),
    },
    run("pay_bill", async (a: { bill: string; amount?: number; paid_on?: string; ahead?: boolean }, ctx, now) => ({ ...(await payBill(dbFrom(ctx), a.bill, { amount: a.amount, paidOn: a.paid_on, ahead: a.ahead }, now)) })),
  );

  server.registerTool(
    "update_bill",
    {
      title: "Update bill",
      description:
        "Change a bill: amount (a price rise), title, category, tag, how often, or `next_due` (moves the day it repeats " +
        "on too). `skip: true` = not paying this one (a month off): moves on without logging money. `status` paused " +
        "(stops reminders, keeps it), active, or ended (cancelled the subscription — a win worth naming).",
      inputSchema: z.object({
        bill: z.string().trim().min(1),
        title: z.string().trim().min(1).max(100).optional(),
        amount: amount.optional(),
        category: category.optional(),
        tag: z.enum(["need", "want"]).optional(),
        every: z.enum(["week", "month", "year"]).optional(),
        next_due: date.optional(),
        status: z.enum(["active", "paused", "ended"]).optional(),
        skip: z.boolean().optional(),
      }),
    },
    run("update_bill", async (a: { bill: string; title?: string; amount?: number; category?: string; tag?: "need" | "want"; every?: "week" | "month" | "year"; next_due?: string; status?: "active" | "paused" | "ended"; skip?: boolean }, ctx, now) => {
      const { bill, next_due, ...rest } = a;
      return { ...(await updateBill(dbFrom(ctx), bill, { ...rest, nextDue: next_due }, now)) };
    }),
  );

  server.registerTool(
    "list_bills",
    {
      title: "Bills",
      description: "Their bills with next due dates, what's due in the next 7 days (overdue marked), and what bills cost a month all together.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run("list_bills", async (_a: Record<string, never>, ctx, now) => ({ ...(await loadBills(dbFrom(ctx), now)) })),
  );

  server.registerTool(
    "add_debt",
    {
      title: "Record money owed",
      description:
        "Money borrowed or lent. direction 'i_owe' = someone lent them money; 'owed_to_me' = they lent someone money. " +
        "By default the money moves now (borrowing raises the balance, lending lowers it) as a loan — never income or " +
        "spending, so no split and no flags; money_moved=false for an old loan from before they logged money. A " +
        "`due_on` makes a task: 'Pay back …' (a must) or 'Ask … about the …'. Paying back on time is keeping their word.",
      inputSchema: z.object({
        person: z.string().trim().min(1).max(100),
        direction: z.enum(["i_owe", "owed_to_me"]),
        amount,
        reason: z.string().max(300).optional(),
        due_on: date.optional(),
        money_moved: z.boolean().default(true),
        person_id: z.uuid().optional().describe("From list_people, if they're there"),
      }),
    },
    run("add_debt", async (a: { person: string; direction: "i_owe" | "owed_to_me"; amount: number; reason?: string; due_on?: string; money_moved: boolean; person_id?: string }, ctx, now) => ({
      ...(await addDebt(dbFrom(ctx), { person: a.person, personId: a.person_id, direction: a.direction, amount: a.amount, reason: a.reason, dueOn: a.due_on, moneyMoved: a.money_moved }, now)),
    })),
  );

  server.registerTool(
    "pay_debt",
    {
      title: "Record a repayment",
      description:
        "Money paid back, either way (by person or debt id). Omit `amount` for all that's left. More than what's left " +
        "is refused. Paying the last of it settles the debt. If several open debts match the person, the result is " +
        "'which_one' — ask, then call with the id.",
      inputSchema: z.object({ debt: z.string().trim().min(1), amount: amount.optional(), money_moved: z.boolean().default(true) }),
    },
    run("pay_debt", async (a: { debt: string; amount?: number; money_moved: boolean }, ctx, now) => ({ ...(await payDebt(dbFrom(ctx), a.debt, a.amount ?? null, { moneyMoved: a.money_moved }, now)) })),
  );

  server.registerTool(
    "forgive_debt",
    {
      title: "Close a debt without payment",
      description: "They let it go, or the user did: closed with nothing more owed and no money moving. Its task is cancelled.",
      inputSchema: z.object({ debt: z.string().trim().min(1) }),
    },
    run("forgive_debt", async (a: { debt: string }, ctx, now) => ({ ...(await forgiveDebt(dbFrom(ctx), a.debt, now)) })),
  );

  server.registerTool(
    "list_debts",
    {
      title: "Money owed",
      description: "Open debts both ways with what's left, the totals, and what's overdue. include_closed for settled and forgiven too.",
      inputSchema: z.object({ include_closed: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    run("list_debts", async (a: { include_closed?: boolean }, ctx, now) => ({ ...(await loadDebts(dbFrom(ctx), now, { includeClosed: a.include_closed })) })),
  );
}
