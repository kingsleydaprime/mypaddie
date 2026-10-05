"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { TIERS } from "@/shared/domain";
import { requireDb } from "@/shared/supabase/session";
import { addItem } from "./items.repo";

const optionalText = z.string().trim().transform((v) => v || null);
const optionalNaira = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(/[,₦\s]/g, ""))))
  .pipe(z.number().int().nonnegative().nullable());

const schema = z.object({
  tier: z.enum(TIERS),
  title: z.string().trim().min(1, "Give it a name"),
  target: optionalText,
  deadline: optionalText.pipe(z.iso.date().nullable()),
  floor_amount: optionalNaira,
  comfortable_amount: optionalNaira,
});

export type AddItemState = { error: string } | null;

export async function addItemAction(_prev: AddItemState, formData: FormData): Promise<AddItemState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  if (v.floor_amount !== null && v.comfortable_amount !== null && v.floor_amount > v.comfortable_amount) {
    return { error: "The cheapest version can't cost more than what you spend now" };
  }

  const db = await requireDb("/quests/new");
  await addItem(db, {
    tier: v.tier,
    title: v.title,
    target: v.target,
    deadline: v.deadline,
    floorAmount: v.floor_amount,
    comfortableAmount: v.comfortable_amount,
  });
  redirect(`/quests?tier=${v.tier}`);
}
