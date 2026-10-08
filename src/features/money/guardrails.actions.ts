"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseAmount } from "@/shared/format";
import { requireDb } from "@/shared/supabase/session";
import { addBill, addDebt, payBill, payDebt, setCap, updateBill } from "./guardrails.repo";

const PAGE = "/app/money/limits";
const money = z.string().transform((v) => parseAmount(v)).pipe(z.number().int().positive("Enter an amount"));
const optionalText = z.string().trim().optional().transform((v) => v || null);

/** Back to the page, with a message for a refusal; a success just shows the new state. */
function back(error?: string): never {
  revalidatePath(PAGE);
  revalidatePath("/app/money");
  redirect(error ? `${PAGE}?e=${encodeURIComponent(error)}` : PAGE);
}

const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";

export async function setCapAction(form: FormData) {
  const parsed = z.object({ category: z.string().trim().min(1, "Which category?"), cap: z.string() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) back(first(parsed.error));
  const raw = parsed.data.cap.trim();
  const cap = raw === "" ? null : parseAmount(raw);
  if (cap !== null && !(cap > 0)) back("A cap is more than zero (leave it empty to remove)");
  await setCap(await requireDb(PAGE), parsed.data.category, cap);
  back();
}

export async function addBillAction(form: FormData) {
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Name the bill"),
      amount: money,
      every: z.enum(["once", "week", "month", "year"]),
      first_due: optionalText.pipe(z.iso.date().nullable()),
      trial_ends_on: optionalText.pipe(z.iso.date().nullable()),
      tag: z.enum(["need", "want"]),
      category: optionalText,
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) back(first(parsed.error));
  const v = parsed.data;
  if (!v.first_due && !v.trial_ends_on) back("Pick the date it's due (or when the free trial ends)");
  if (v.trial_ends_on && v.every === "once") back("A free trial is for something that repeats");
  const res = await addBill(
    await requireDb(PAGE),
    { title: v.title, amount: v.amount, every: v.every, firstDue: v.first_due ?? undefined, trialEndsOn: v.trial_ends_on, tag: v.tag, category: v.category ?? undefined },
    new Date(),
  );
  back(res.result === "exists" ? `You already have a bill called ${v.title}` : undefined);
}

export async function payBillAction(form: FormData) {
  const v = z.object({ id: z.uuid(), due: z.iso.date() }).parse(Object.fromEntries(form));
  // forDue: the date the button showed, so a double tap can't pay next month's.
  const res = await payBill(await requireDb(PAGE), v.id, { forDue: v.due }, new Date());
  back(res.result === "paid" ? undefined : res.result === "already_paid" ? "Already paid" : "Couldn't pay that one");
}

/** Pause, resume, or end a bill (cancelled the subscription, or don't owe it any more). */
export async function setBillStatusAction(form: FormData) {
  const v = z.object({ id: z.uuid(), status: z.enum(["active", "paused", "ended"]) }).parse(Object.fromEntries(form));
  const res = await updateBill(await requireDb(PAGE), v.id, { status: v.status }, new Date());
  back(res.result === "not_found" ? "Couldn't find that one" : undefined);
}

export async function addDebtAction(form: FormData) {
  const parsed = z
    .object({
      person: z.string().trim().min(1, "Who?"),
      direction: z.enum(["i_owe", "owed_to_me"]),
      amount: money,
      reason: optionalText,
      due_on: optionalText.pipe(z.iso.date().nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) back(first(parsed.error));
  const v = parsed.data;
  await addDebt(await requireDb(PAGE), { person: v.person, direction: v.direction, amount: v.amount, reason: v.reason, dueOn: v.due_on }, new Date());
  back();
}

export async function payDebtAction(form: FormData) {
  const parsed = z.object({ id: z.uuid(), amount: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) back("Couldn't tell which one");
  const raw = parsed.data.amount?.trim();
  const res = await payDebt(await requireDb(PAGE), parsed.data.id, raw ? parseAmount(raw) : null, {}, new Date());
  back(res.result === "more_than_owed" ? "That's more than what's left" : res.result === "paid" || res.result === "settled" ? undefined : "Couldn't record that");
}
