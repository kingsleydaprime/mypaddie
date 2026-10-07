"use server";

import { revalidatePath } from "next/cache";
import { formatMoney, parseAmount } from "@/shared/format";
import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { editTransaction, setBalance, setPurchaseInterest, voidTransaction } from "./money.repo";

export type FormState = null | { error: string } | { ok: string };

const amountOf = (v: FormDataEntryValue | null) => parseAmount(String(v ?? ""));

export async function setBalanceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const amount = amountOf(form.get("amount"));
  if (!Number.isInteger(amount) || amount < 0) return { error: "A whole amount, 0 or more" };
  const db = await requireDb("/app/money/history");
  const r = await setBalance(db, amount, new Date());
  revalidatePath("/app/money");
  revalidatePath("/app/money/history");
  if (r.result === "unchanged") return { ok: "Already right." };
  const { recorded } = r;
  return {
    ok:
      recorded.kind === "opening"
        ? "Opening balance recorded."
        : `Corrected by ${recorded.direction === "in" ? "+" : "−"}${formatMoney(recorded.amount)}. Anything you forgot to log?`,
  };
}

export async function editTransactionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id"));
  const category = String(form.get("category") ?? "").trim();
  if (!category) return { error: "Category can't be empty" };
  const db = await requireDb(`/app/money/tx/${id}`);
  const r = await editTransaction(db, id, { note: String(form.get("note") ?? ""), category });
  if (r === "not_found") return { error: "Can't edit a voided entry." };
  revalidatePath("/app/money");
  revalidatePath("/app/money/history");
  return { ok: "Saved." };
}

export async function voidTransactionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id"));
  const db = await requireDb(`/app/money/tx/${id}`);
  const r = await voidTransaction(db, id, String(form.get("reason") ?? "").trim() || null);
  if (r === "split_applied") return { error: "This income was already split into buckets, so it can't be voided here." };
  if (r === "already_voided") return { error: "Already voided." };
  if (r === "not_found") return { error: "Not found." };
  revalidatePath("/app/money");
  redirect("/app/money/history");
}

export async function purchaseInterestAction(id: string, interest: "interested" | "not_interested") {
  const db = await requireDb("/app/money");
  await setPurchaseInterest(db, id, interest);
  revalidatePath("/app/money");
}
