import type { PillarWeight } from "@/features/xp/split";
import type { Pillar, Tier } from "@/shared/domain";
import type { Json } from "@/shared/supabase/database.types";
import type { Db } from "@/shared/supabase/token-client";
import { amountsForTier, canChangeStatus, completionPays, DEFAULT_ITEM_BASE_XP, itemCompletionXp, itemWeights, type ItemStatus } from "./items";

export type { ItemStatus };

export interface NewItem {
  tier: Tier;
  title: string;
  target?: string | null;
  deadline?: string | null;
  priority?: number;
  floorAmount?: number | null;
  comfortableAmount?: number | null;
}

export async function addItem(db: Db, item: NewItem) {
  const { data, error } = await db
    .from("items")
    .insert({
      tier: item.tier,
      title: item.title,
      target: item.target ?? null,
      deadline: item.deadline ?? null,
      priority: item.priority ?? 100,
      floor_amount: item.tier === "need" ? item.floorAmount ?? null : null,
      comfortable_amount: item.tier === "need" ? item.comfortableAmount ?? null : null,
    })
    .select("id, tier, title")
    .single();
  if (error) throw new Error(`adding item: ${error.message}`);
  return data;
}

export async function listItems(db: Db, opts: { tier?: Tier; status?: ItemStatus } = {}) {
  let query = db
    .from("items")
    .select("id, tier, title, target, deadline, status, priority, floor_amount, comfortable_amount")
    .eq("status", opts.status ?? "active")
    .order("priority")
    .order("created_at");
  if (opts.tier) query = query.eq("tier", opts.tier);
  const { data, error } = await query;
  if (error) throw new Error(`listing items: ${error.message}`);
  return data;
}

export type ItemRow = Awaited<ReturnType<typeof listItems>>[number];

export interface ItemChanges {
  tier?: Tier;
  title?: string;
  target?: string | null;
  deadline?: string | null;
  priority?: number;
  floorAmount?: number | null;
  comfortableAmount?: number | null;
}

async function getItem(db: Db, id: string) {
  const { data, error } = await db
    .from("items")
    .select("id, tier, title, status, floor_amount, comfortable_amount")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`reading item: ${error.message}`);
  return data;
}

/** Edit an item. Moving it off "need" clears the money amounts (they only mean something on needs). */
export async function updateItem(db: Db, id: string, changes: ItemChanges) {
  const item = await getItem(db, id);
  if (!item) return { result: "not_found" as const };
  const tier = changes.tier ?? item.tier;
  const amounts = amountsForTier(tier, {
    floorAmount: changes.floorAmount === undefined ? item.floor_amount : changes.floorAmount,
    comfortableAmount: changes.comfortableAmount === undefined ? item.comfortable_amount : changes.comfortableAmount,
  });
  if (amounts.floorAmount != null && amounts.comfortableAmount != null && amounts.floorAmount > amounts.comfortableAmount) {
    return { result: "floor_above_comfortable" as const };
  }
  const patch = {
    ...(changes.tier !== undefined && { tier: changes.tier }),
    ...(changes.title !== undefined && { title: changes.title }),
    ...(changes.target !== undefined && { target: changes.target }),
    ...(changes.deadline !== undefined && { deadline: changes.deadline }),
    ...(changes.priority !== undefined && { priority: changes.priority }),
    floor_amount: amounts.floorAmount ?? null,
    comfortable_amount: amounts.comfortableAmount ?? null,
  };
  const { data, error } = await db
    .from("items")
    .update(patch)
    .eq("id", id)
    .select("id, tier, title, target, deadline, status, priority, floor_amount, comfortable_amount")
    .single();
  if (error) throw new Error(`updating item: ${error.message}`);
  return { result: "updated" as const, item: data };
}

/** Pause, drop or reopen. Finishing goes through completeItem so the bonus is paid with it. */
export async function setItemStatus(db: Db, id: string, to: Exclude<ItemStatus, "done">) {
  const item = await getItem(db, id);
  if (!item) return { result: "not_found" as const };
  if (!canChangeStatus(item.status, to)) return { result: "not_allowed" as const, from: item.status, to };
  const { error } = await db
    .from("items")
    .update({ status: to, done_at: null, status_changed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`changing item status: ${error.message}`);
  return { result: to, title: item.title };
}

/** Where the item's effort went (its tasks' weights) and the XP of its last finished task. */
async function bonusInputs(db: Db, itemId: string) {
  const { data, error } = await db
    .from("tasks")
    .select("base_xp, status, done_at, task_pillars (pillar, weight)")
    .eq("item_id", itemId);
  if (error) throw new Error(`reading item tasks: ${error.message}`);
  const weights = itemWeights(data.map((t) => t.task_pillars.map((p) => ({ pillar: p.pillar as Pillar, weight: p.weight }))));
  const lastDone = data
    .filter((t) => t.status === "done" && t.done_at)
    .sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1))[0];
  return { weights, baseXp: lastDone?.base_xp ?? DEFAULT_ITEM_BASE_XP };
}

/**
 * Finish an item. A goal or wish pays its bonus to the pillars its tasks
 * fed; with no tasks, `weights` must say where it goes.
 */
export async function completeItem(db: Db, id: string, opts: { weights?: PillarWeight[]; doneAt?: Date } = {}) {
  const item = await getItem(db, id);
  if (!item) return { result: "not_found" as const };
  if (!canChangeStatus(item.status, "done")) {
    return { result: item.status === "done" ? ("already_done" as const) : ("not_allowed" as const), from: item.status };
  }
  const doneAt = opts.doneAt ?? new Date();
  let entries: ReturnType<typeof itemCompletionXp> = [];
  if (completionPays(item.tier)) {
    const inputs = await bonusInputs(db, id);
    const weights = opts.weights ?? inputs.weights;
    if (!weights) return { result: "needs_weights" as const, title: item.title, tier: item.tier };
    entries = itemCompletionXp(item.tier, inputs.baseXp, weights);
  }
  const { data, error } = await db.rpc("complete_item", {
    p_item_id: id,
    p_done_at: doneAt.toISOString(),
    p_entries: entries as unknown as Json,
  });
  if (error) throw new Error(`completing item: ${error.message}`);
  const result = (data as { result: string }).result;
  return { result, title: item.title, tier: item.tier, xp: result === "completed" ? entries : [] };
}

/**
 * Delete an item added by mistake. Anything with history (tasks, XP) is
 * dropped instead, so the record of what happened stays.
 */
export async function deleteItem(db: Db, id: string) {
  const item = await getItem(db, id);
  if (!item) return { result: "not_found" as const };
  const [tasks, xp] = await Promise.all([
    db.from("tasks").select("id", { count: "exact", head: true }).eq("item_id", id),
    db.from("xp_log").select("id", { count: "exact", head: true }).eq("item_id", id),
  ]);
  if (tasks.error) throw new Error(`checking item tasks: ${tasks.error.message}`);
  if (xp.error) throw new Error(`checking item XP: ${xp.error.message}`);
  if ((tasks.count ?? 0) > 0 || (xp.count ?? 0) > 0) return { result: "has_history" as const, title: item.title };
  const { error } = await db.from("items").delete().eq("id", id);
  if (error) throw new Error(`deleting item: ${error.message}`);
  return { result: "deleted" as const, title: item.title };
}
