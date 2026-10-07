import { completeTask, createTask, updateTask } from "@/features/tasks/tasks.repo";
import { transactionLoggedXp } from "@/features/xp/xp";
import { currentConfig } from "@/shared/config";
import { formatMoney } from "@/shared/format";
import type { Json } from "@/shared/supabase/database.types";
import { escapeLike } from "@/shared/supabase/like";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey, startOfMonth } from "@/shared/time";
import {
  billsDue,
  capFlag,
  capFor,
  capsThisMonth,
  categoryKey,
  checkPayment,
  debtSummary,
  monthlyEquivalent,
  nextDue,
  paidRecently,
  remaining,
  type BillEvery,
  type CapStatus,
  type DebtDirection,
} from "./guardrails";

const today = (now: Date) => dayKey(now, currentConfig().timeZone);
const MONEY_WEIGHTS = [{ pillar: "financial" as const, weight: 100 }];

// ─── Caps ───────────────────────────────────────────────────────────────────

/** Every cap with this month's spending in its category (any tag; voided and balance entries don't count). */
export async function loadCaps(db: Db, now: Date): Promise<CapStatus[]> {
  const [caps, spent] = await Promise.all([
    db.from("spending_caps").select("category, monthly_cap").order("category"),
    db
      .from("transactions")
      .select("category, amount")
      .eq("kind", "normal")
      .eq("direction", "out")
      .is("voided_at", null)
      .gte("at", startOfMonth(now, currentConfig().timeZone).toISOString()),
  ]);
  if (caps.error) throw new Error(`loading caps: ${caps.error.message}`);
  if (spent.error) throw new Error(`loading spending: ${spent.error.message}`);
  return capsThisMonth(caps.data.map((c) => ({ category: c.category, monthlyCap: c.monthly_cap })), spent.data);
}

export async function capForCategory(db: Db, category: string | null | undefined, now: Date) {
  return category ? capFor(await loadCaps(db, now), category) : null;
}

/** The flag for a spend about to be logged, judged against the cap as it stood before. */
export async function capFlagFor(db: Db, category: string, amount: number, now: Date) {
  return capFlag(await capForCategory(db, category, now), amount);
}

/** Set a monthly cap for a category, or remove it with null. */
export async function setCap(db: Db, category: string, monthlyCap: number | null) {
  const { data: existing, error } = await db.from("spending_caps").select("id, category");
  if (error) throw new Error(`loading caps: ${error.message}`);
  const match = existing.find((c) => categoryKey(c.category) === categoryKey(category));
  if (monthlyCap === null) {
    if (!match) return { result: "no_cap" as const, category };
    const { error: e } = await db.from("spending_caps").delete().eq("id", match.id);
    if (e) throw new Error(`removing the cap: ${e.message}`);
    return { result: "removed" as const, category: match.category };
  }
  const { error: e } = match
    ? await db.from("spending_caps").update({ monthly_cap: monthlyCap }).eq("id", match.id)
    : await db.from("spending_caps").insert({ category: category.trim(), monthly_cap: monthlyCap });
  if (e) throw new Error(`saving the cap: ${e.message}`);
  return { result: match ? ("updated" as const) : ("set" as const), category: match?.category ?? category.trim(), monthlyCap };
}

// ─── Bills ──────────────────────────────────────────────────────────────────

const BILL_COLUMNS = "id, title, amount, category, tag, every, anchor_on, next_due, item_id, task_id, status, last_paid_at";

type BillRow = {
  id: string;
  title: string;
  amount: number;
  category: string;
  tag: "need" | "want" | "unsure";
  every: string;
  anchor_on: string;
  next_due: string;
  item_id: string | null;
  task_id: string | null;
  status: string;
  last_paid_at: string | null;
};

async function findBill(db: Db, ref: string): Promise<BillRow | null> {
  const isId = /^[0-9a-f-]{36}$/i.test(ref);
  const q = db.from("bills").select(BILL_COLUMNS).neq("status", "ended");
  const { data, error } = await (isId ? q.eq("id", ref) : q.ilike("title", escapeLike(ref.trim()))).limit(1);
  if (error) throw new Error(`finding the bill: ${error.message}`);
  return (data[0] as BillRow | undefined) ?? null;
}

/** The "Pay: Data (₦5,000)" task for a bill's next due date. Fixed: a bill can't be moved for capacity. */
async function makeBillTask(db: Db, bill: BillRow, now: Date): Promise<string | null> {
  const made = await createTask(
    db,
    {
      title: `Pay: ${bill.title} (${formatMoney(bill.amount)})`,
      itemId: bill.item_id,
      baseXp: 5,
      dueDate: bill.next_due,
      dueTime: null,
      recurrence: null,
      nonNegotiable: bill.tag === "need",
      weights: MONEY_WEIGHTS,
      durationMinutes: 5,
      fixed: true,
    },
    now,
  );
  const taskId = made.result === "created" ? made.task.id : null;
  await db.from("bills").update({ task_id: taskId }).eq("id", bill.id);
  return taskId;
}

async function dropBillTask(db: Db, bill: BillRow, now: Date) {
  if (bill.task_id) await updateTask(db, bill.task_id, {}, "cancel", now).catch(() => undefined);
}

export interface NewBill {
  title: string;
  amount: number;
  category?: string;
  tag?: "need" | "want";
  every: BillEvery;
  firstDue: string;
  itemId?: string | null;
}

export async function addBill(db: Db, input: NewBill, now: Date) {
  const { data, error } = await db
    .from("bills")
    .insert({
      title: input.title.trim(),
      amount: input.amount,
      category: (input.category ?? input.title).trim(),
      tag: input.tag ?? "need",
      every: input.every,
      anchor_on: input.firstDue,
      next_due: input.firstDue,
      item_id: input.itemId ?? null,
    })
    .select(BILL_COLUMNS)
    .single();
  if (error?.code === "23505") return { result: "exists" as const, title: input.title.trim() };
  if (error) throw new Error(`adding the bill: ${error.message}`);
  await makeBillTask(db, data as BillRow, now);
  return { result: "added" as const, bill: { id: data.id, title: data.title, amount: data.amount, every: data.every, nextDue: data.next_due } };
}

/**
 * Pay the bill that's due: the spend is logged (bucket, XP) and the bill moves
 * to its next date in one step; its task is ticked off and the next one made.
 * Paying the same due date twice pays once.
 */
export async function payBill(db: Db, ref: string, opts: { amount?: number; paidOn?: string | null; ahead?: boolean; forDue?: string }, now: Date) {
  const bill = await findBill(db, ref);
  if (!bill) return { result: "not_found" as const };
  // The app's button names the due date it showed; a mismatch means it was already paid.
  if (opts.forDue && opts.forDue !== bill.next_due) return { result: "already_paid" as const, title: bill.title, nextDue: bill.next_due };
  if (!opts.ahead && !opts.forDue && paidRecently(bill.every as BillEvery, bill.last_paid_at ? new Date(bill.last_paid_at) : null, now)) {
    return { result: "recently_paid" as const, title: bill.title, lastPaidAt: bill.last_paid_at, nextDue: bill.next_due };
  }
  const amount = opts.amount ?? bill.amount;
  const flag = await capFlagFor(db, bill.category, amount, now);
  const following = nextDue(bill.every as BillEvery, bill.anchor_on, bill.next_due);
  const { data, error } = await db.rpc("pay_bill", {
    p_bill_id: bill.id,
    p_for_due: bill.next_due,
    p_next_due: following,
    p_amount: amount,
    p_at: (opts.paidOn ? new Date(`${opts.paidOn}T12:00:00Z`).toISOString() : null) as string,
    p_xp: transactionLoggedXp() as unknown as Json,
  });
  if (error) throw new Error(`paying the bill: ${error.message}`);
  const res = data as { result: string; transaction_id?: string };
  if (res.result !== "paid") return { result: res.result, title: bill.title, nextDue: bill.next_due };

  if (bill.task_id) await completeTask(db, bill.task_id, now).catch(() => undefined);
  await makeBillTask(db, { ...bill, next_due: following }, now);
  return {
    result: "paid" as const,
    title: bill.title,
    amount,
    paidFor: bill.next_due,
    nextDue: following,
    transactionId: res.transaction_id,
    ...(amount !== bill.amount ? { note: `Usually ${formatMoney(bill.amount)} — update_bill if the price changed for good.` } : {}),
    flags: flag ? [flag] : [],
  };
}

export interface BillChanges {
  title?: string;
  amount?: number;
  category?: string;
  tag?: "need" | "want";
  /** Move the next due date (and the day it repeats on). */
  nextDue?: string;
  every?: BillEvery;
  status?: "active" | "paused" | "ended";
  /** Not paying this one (a month off): move on without logging money. */
  skip?: boolean;
}

export async function updateBill(db: Db, ref: string, changes: BillChanges, now: Date) {
  const bill = await findBill(db, ref);
  if (!bill) return { result: "not_found" as const };
  const every = changes.every ?? (bill.every as BillEvery);
  let next = changes.nextDue ?? bill.next_due;
  let anchor = changes.nextDue ?? bill.anchor_on;
  if (changes.skip) {
    next = nextDue(every, anchor, bill.next_due);
    anchor = bill.anchor_on;
  }
  const patch = {
    ...(changes.title !== undefined && { title: changes.title.trim() }),
    ...(changes.amount !== undefined && { amount: changes.amount }),
    ...(changes.category !== undefined && { category: changes.category.trim() }),
    ...(changes.tag !== undefined && { tag: changes.tag }),
    ...(changes.status !== undefined && { status: changes.status }),
    every,
    anchor_on: anchor,
    next_due: next,
  };
  const { data, error } = await db.from("bills").update(patch).eq("id", bill.id).select(BILL_COLUMNS).single();
  if (error?.code === "23505") return { result: "title_taken" as const };
  if (error) throw new Error(`updating the bill: ${error.message}`);
  const after = data as BillRow;

  // The open task follows: a new date, title, amount or status means a fresh one.
  const taskChanged = next !== bill.next_due || after.status !== bill.status || after.title !== bill.title || after.amount !== bill.amount || after.tag !== bill.tag;
  if (taskChanged) {
    await dropBillTask(db, bill, now);
    if (after.status === "active") await makeBillTask(db, after, now);
    else await db.from("bills").update({ task_id: null }).eq("id", bill.id);
  }
  return { result: changes.skip ? ("skipped" as const) : ("updated" as const), title: after.title, nextDue: after.next_due, status: after.status };
}

export async function loadBills(db: Db, now: Date) {
  const { data, error } = await db.from("bills").select(BILL_COLUMNS).neq("status", "ended").order("next_due");
  if (error) throw new Error(`loading bills: ${error.message}`);
  const bills = (data as BillRow[]).map((b) => ({
    id: b.id,
    title: b.title,
    amount: b.amount,
    category: b.category,
    tag: b.tag,
    every: b.every as BillEvery,
    nextDue: b.next_due,
    status: b.status as "active" | "paused" | "ended",
    lastPaidAt: b.last_paid_at,
  }));
  const active = bills.filter((b) => b.status === "active");
  return {
    bills,
    dueSoon: billsDue(bills, today(now), 7),
    monthlyTotal: active.reduce((s, b) => s + monthlyEquivalent(b.amount, b.every), 0),
  };
}

// ─── Debts ──────────────────────────────────────────────────────────────────

type DebtRow = {
  id: string;
  person: string;
  direction: DebtDirection;
  amount: number;
  reason: string | null;
  due_on: string | null;
  status: "open" | "settled" | "forgiven";
  task_id: string | null;
  created_at: string;
  debt_payments: { amount: number; at: string }[];
};

const DEBT_COLUMNS = "id, person, direction, amount, reason, due_on, status, task_id, created_at, debt_payments(amount, at)";

const toDebt = (d: DebtRow) => ({
  id: d.id,
  person: d.person,
  direction: d.direction,
  amount: d.amount,
  paid: d.debt_payments.reduce((s, p) => s + p.amount, 0),
  reason: d.reason,
  dueOn: d.due_on,
  status: d.status,
  taskId: d.task_id,
});

export async function loadDebts(db: Db, now: Date, opts: { includeClosed?: boolean } = {}) {
  let q = db.from("debts").select(DEBT_COLUMNS).order("due_on", { ascending: true, nullsFirst: false });
  if (!opts.includeClosed) q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) throw new Error(`loading debts: ${error.message}`);
  const debts = (data as unknown as DebtRow[]).map(toDebt);
  return { debts: debts.map((d) => ({ ...d, left: remaining(d) })), ...debtSummary(debts, today(now)) };
}

/** Open debts matching an id or a person's name; several means the caller must pick. */
async function findDebts(db: Db, ref: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(ref);
  const q = db.from("debts").select(DEBT_COLUMNS).eq("status", "open");
  const { data, error } = await (isId ? q.eq("id", ref) : q.ilike("person", escapeLike(ref.trim())));
  if (error) throw new Error(`finding the debt: ${error.message}`);
  return (data as unknown as DebtRow[]).map(toDebt);
}

export interface NewDebt {
  person: string;
  personId?: string | null;
  direction: DebtDirection;
  amount: number;
  reason?: string | null;
  dueOn?: string | null;
  /** False for a loan that happened before they started logging money. */
  moneyMoved?: boolean;
}

export async function addDebt(db: Db, input: NewDebt, now: Date) {
  const { data: id, error } = await db.rpc("add_debt", {
    p_person: input.person,
    p_person_id: (input.personId ?? null) as string,
    p_direction: input.direction,
    p_amount: input.amount,
    p_reason: (input.reason ?? null) as string,
    p_due_on: (input.dueOn ?? null) as string,
    p_money_moved: input.moneyMoved ?? true,
    p_at: now.toISOString(),
  });
  if (error) throw new Error(`recording the debt: ${error.message}`);

  // A due date gets a task: paying back is a must; chasing your own money isn't.
  if (input.dueOn) {
    const owe = input.direction === "i_owe";
    const made = await createTask(
      db,
      {
        title: owe ? `Pay back ${input.person.trim()} (${formatMoney(input.amount)})` : `Ask ${input.person.trim()} about the ${formatMoney(input.amount)}`,
        itemId: null,
        baseXp: owe ? 10 : 5,
        dueDate: input.dueOn,
        dueTime: null,
        recurrence: null,
        nonNegotiable: owe,
        weights: owe ? [{ pillar: "financial", weight: 50 }, { pillar: "character", weight: 50 }] : MONEY_WEIGHTS,
        durationMinutes: 5,
        fixed: true,
      },
      now,
    );
    if (made.result === "created") await db.from("debts").update({ task_id: made.task.id }).eq("id", id);
  }
  return { result: "recorded" as const, id, person: input.person.trim(), direction: input.direction, amount: input.amount, dueOn: input.dueOn ?? null };
}

/** Money paid back (either way). Paying the last of it settles the debt and ticks its task. */
export async function payDebt(db: Db, ref: string, amount: number | null, opts: { moneyMoved?: boolean }, now: Date) {
  const matches = await findDebts(db, ref);
  if (matches.length === 0) return { result: "not_found" as const };
  if (matches.length > 1) {
    return { result: "which_one" as const, debts: matches.map((d) => ({ id: d.id, person: d.person, direction: d.direction, left: remaining(d), reason: d.reason })) };
  }
  const debt = matches[0]!;
  const pay = amount ?? remaining(debt);
  const check = checkPayment(debt, pay);
  if (!check.ok) return { result: check.reason, left: check.left };

  const { data, error } = await db.rpc("record_debt_payment", {
    p_debt_id: debt.id,
    p_amount: pay,
    p_money_moved: opts.moneyMoved ?? true,
    p_at: now.toISOString(),
  });
  if (error) throw new Error(`recording the payment: ${error.message}`);
  const res = data as { result: string; left?: number };
  if (res.result === "settled" && debt.taskId) await completeTask(db, debt.taskId, now).catch(() => undefined);
  return { ...res, person: debt.person, direction: debt.direction, paid: pay };
}

/** They let it go (or you did): closed, nothing more owed, no money moves. */
export async function forgiveDebt(db: Db, ref: string, now: Date) {
  const matches = await findDebts(db, ref);
  if (matches.length !== 1) return matches.length === 0 ? { result: "not_found" as const } : { result: "which_one" as const, debts: matches.map((d) => ({ id: d.id, person: d.person, left: remaining(d) })) };
  const debt = matches[0]!;
  const { error } = await db.from("debts").update({ status: "forgiven", closed_at: now.toISOString() }).eq("id", debt.id);
  if (error) throw new Error(`closing the debt: ${error.message}`);
  if (debt.taskId) await updateTask(db, debt.taskId, {}, "cancel", now).catch(() => undefined);
  return { result: "forgiven" as const, person: debt.person, direction: debt.direction, left: remaining(debt) };
}
