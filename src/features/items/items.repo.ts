import type { Tier } from "@/shared/domain";
import type { Db } from "@/shared/supabase/token-client";

export type ItemStatus = "active" | "done" | "paused" | "dropped";

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
