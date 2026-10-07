"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLARS } from "@/shared/domain";
import { editItemSchema as editSchema, itemFormSchema as schema } from "./items.form";
import { requireDb } from "@/shared/supabase/session";
import { addItem, completeItem, deleteItem, setItemStatus, updateItem } from "./items.repo";

export type AddItemState = { error: string } | null;

export async function addItemAction(_prev: AddItemState, formData: FormData): Promise<AddItemState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  if (v.floor_amount !== null && v.comfortable_amount !== null && v.floor_amount > v.comfortable_amount) {
    return { error: "The cheapest version can't cost more than what you spend now" };
  }

  const db = await requireDb("/app/quests/new");
  await addItem(db, {
    tier: v.tier,
    title: v.title,
    target: v.target,
    deadline: v.deadline,
    floorAmount: v.floor_amount,
    comfortableAmount: v.comfortable_amount,
  });
  redirect(`/app/quests?tier=${v.tier}`);
}

export async function updateItemAction(_prev: AddItemState, formData: FormData): Promise<AddItemState> {
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const db = await requireDb(`/app/quests/${v.id}`);
  const res = await updateItem(db, v.id, {
    tier: v.tier,
    title: v.title,
    target: v.target,
    deadline: v.deadline,
    floorAmount: v.floor_amount,
    comfortableAmount: v.comfortable_amount,
  });
  if (res.result === "floor_above_comfortable") return { error: "The cheapest version can't cost more than what you spend now" };
  if (res.result === "not_found") return { error: "That quest is gone" };
  redirect(`/app/quests?tier=${v.tier}`);
}

export type ItemActionState = { error?: string; message?: string; askPillar?: boolean } | null;

export async function itemStatusAction(_prev: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const id = z.uuid().parse(formData.get("id"));
  const to = z.enum(["done", "active", "paused", "dropped", "delete"]).parse(formData.get("to"));
  const db = await requireDb(`/app/quests/${id}`);

  if (to === "delete") {
    const res = await deleteItem(db, id);
    if (res.result === "has_history") return { error: "It has tasks or XP behind it, so drop it instead — the record stays." };
    redirect("/app/quests");
  }
  if (to === "done") {
    const pillar = z.enum(PILLARS).optional().safeParse(formData.get("pillar") || undefined);
    const weights = pillar.success && pillar.data ? [{ pillar: pillar.data, weight: 100 }] : undefined;
    const res = await completeItem(db, id, { weights });
    if (res.result === "needs_weights") return { askPillar: true, message: "Which part of life did this serve? The bonus goes there." };
    revalidatePath("/app/quests");
    if (res.result !== "completed") return { error: "That couldn't be finished from here." };
    const xp = res.xp.reduce((s, e) => s + e.amount, 0);
    return { message: xp > 0 ? `Done. +${xp} XP.` : "Done." };
  }
  const res = await setItemStatus(db, id, to);
  if (res.result === "not_allowed" || res.result === "not_found") return { error: "That change isn't possible from here." };
  revalidatePath("/app/quests");
  return { message: { active: "Back on.", paused: "Paused. It'll keep.", dropped: "Dropped. Deciding is a skill too." }[to] };
}
