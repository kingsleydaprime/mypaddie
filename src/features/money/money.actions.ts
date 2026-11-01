"use server";

import { revalidatePath } from "next/cache";
import { parseAmount } from "@/shared/format";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { entryOf, MONEY_IN_TYPES, MONEY_OUT_TYPES } from "./kinds";
import { acceptSplit, logTransaction } from "./money.repo";
import type { SpendFlag } from "./purchase";
import type { WaterfallProposal } from "./waterfall";

const schema = z.object({
  amount: z
    .string()
    .transform((v) => parseAmount(v))
    .pipe(z.number({ message: "Enter an amount" }).positive("Enter an amount")),
  direction: z.enum(["in", "out"]),
  /** Money in: income, moved, repaid, refund. Money out: need, want, unsure, moved. */
  type: z.enum([...MONEY_IN_TYPES, ...MONEY_OUT_TYPES]).optional(),
  category: z.string().trim().min(1, "What was it for?"),
});

export type LogState =
  | null
  | { error: string }
  | { ok: true; direction: "in" | "out"; amount: number; xpEarned: number; flags: SpendFlag[]; transactionId: string; proposedSplit: WaterfallProposal | null };

export async function logTransactionAction(_prev: LogState, formData: FormData): Promise<LogState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  if (v.direction === "out" && !v.type) return { error: "Need, want, not sure, or just moving it?" };
  let entry;
  try {
    entry = entryOf(v.direction, v.type ?? "income");
  } catch {
    return { error: "Pick what kind of money it is" };
  }
  if (entry.kind === "loan" || entry.kind === "opening" || entry.kind === "adjustment") return { error: "Pick what kind of money it is" };

  const db = await requireDb("/app/money");
  try {
    const logged = await logTransaction(db, { amount: v.amount, direction: v.direction, category: v.category, tag: entry.tag, kind: entry.kind }, new Date());
    revalidatePath("/app/money");
    return { ok: true, direction: v.direction, amount: v.amount, ...logged };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function acceptSplitAction(transactionId: string) {
  const db = await requireDb("/app/money");
  const outcome = await acceptSplit(db, transactionId, new Date());
  revalidatePath("/app/money");
  return outcome.result;
}
