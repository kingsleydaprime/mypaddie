import { bonusInputs } from "@/features/items/items.repo";
import { loadTrends } from "@/features/metrics/metrics.repo";
import { loadBills, loadCaps, loadDebts } from "@/features/money/guardrails.repo";
import { loadMoneyStage } from "@/features/money/money.repo";
import { loadFunPicture } from "@/features/fun/fun.repo";
import { reachOutDue } from "@/features/people/people";
import { loadPeople } from "@/features/people/people.repo";
import type { PillarWeight } from "@/features/xp/split";
import { currentConfig } from "@/shared/config";
import type { Pillar } from "@/shared/domain";
import type { Json } from "@/shared/supabase/database.types";
import { escapeLike } from "@/shared/supabase/like";
import type { Db } from "@/shared/supabase/token-client";
import { dayKey } from "@/shared/time";
import { lifeMap, type LifeInputs } from "./lifemap";
import { canAchieve, milestoneXp, timeline, type MilestoneStatus, type TimelineEntry } from "./milestones";

const tz = () => currentConfig().timeZone;
const DAY = 86_400_000;

/** Every area of life, judged from what's already logged. */
export async function loadLifeMap(db: Db, now: Date) {
  const since42 = new Date(now.getTime() - 42 * DAY).toISOString();
  const since14 = new Date(now.getTime() - 14 * DAY);
  const [trends, xp, stage, caps, bills, debts, people, contacts, fun, slips] = await Promise.all([
    loadTrends(db, now, 6),
    db.from("xp_log").select("pillar, amount, at").gte("at", since42),
    loadMoneyStage(db, now),
    loadCaps(db, now),
    loadBills(db, now),
    loadDebts(db, now),
    loadPeople(db),
    db.from("people_contacts").select("id", { count: "exact", head: true }).gte("at", since14.toISOString()),
    loadFunPicture(db, now),
    db.from("slips").select("id", { count: "exact", head: true }).gte("at", since14.toISOString()),
  ]);
  if (xp.error) throw new Error(`loading XP: ${xp.error.message}`);

  const xpRecent: Partial<Record<Pillar, number>> = {};
  const xpBefore: Partial<Record<Pillar, number>> = {};
  for (const r of xp.data) {
    const bucket = Date.parse(r.at) >= since14.getTime() ? xpRecent : xpBefore;
    bucket[r.pillar] = (bucket[r.pillar] ?? 0) + r.amount;
  }
  // The 28 days before, per 14 days, to compare like with like.
  for (const p of Object.keys(xpBefore) as Pillar[]) xpBefore[p] = Math.round(xpBefore[p]! / 2);

  const inputs: LifeInputs = {
    trends: Object.fromEntries(trends.map((t) => [t.metric, { recent: t.trend.recent, direction: t.trend.direction, good: t.trend.good }])),
    xpRecent,
    xpBefore,
    money: {
      stage: stage.stage,
      capsOver: caps.filter((c) => c.over).map((c) => c.category),
      billsOverdue: bills.dueSoon.filter((b) => b.overdue).length,
      owedOverdue: debts.overdue.filter((d) => d.direction === "i_owe").length,
      currency: currentConfig().currency,
    },
    people: { dueCount: people.filter((p) => reachOutDue(p, now)).length, contactsRecent: contacts.count ?? 0, tracked: people.length },
    fun: { daysSince: fun.daysSinceFun },
    slipsRecent: slips.count ?? 0,
  };
  return lifeMap(inputs);
}

// ─── Milestones and the timeline ────────────────────────────────────────────

const COLUMNS = "id, kind, title, on_date, status, achieved_on, before, after, note, item_id, items(title, tier)";
type Row = {
  id: string;
  kind: "milestone" | "moment";
  title: string;
  on_date: string | null;
  status: MilestoneStatus;
  achieved_on: string | null;
  before: string | null;
  after: string | null;
  note: string | null;
  item_id: string | null;
  items: { title: string; tier: string } | null;
};

const toEntry = (r: Row): TimelineEntry & { itemId: string | null; note: string | null } => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  status: r.status,
  date: r.achieved_on ?? r.on_date,
  item: r.items?.title ?? null,
  itemId: r.item_id,
  before: r.before,
  after: r.after,
  note: r.note,
});

export async function loadTimeline(db: Db, now: Date) {
  const { data, error } = await db.from("milestones").select(COLUMNS);
  if (error) throw new Error(`loading the timeline: ${error.message}`);
  return timeline((data as unknown as Row[]).map(toEntry), dayKey(now, tz()));
}

export async function loadMilestones(db: Db, itemId: string) {
  const { data, error } = await db.from("milestones").select(COLUMNS).eq("item_id", itemId).neq("status", "dropped").order("on_date", { nullsFirst: false });
  if (error) throw new Error(`loading milestones: ${error.message}`);
  return (data as unknown as Row[]).map(toEntry);
}

export interface NewMilestone {
  kind: "milestone" | "moment";
  title: string;
  itemId?: string | null;
  /** Planned for; for a moment that already happened, when it did. */
  date?: string | null;
  happened?: boolean;
  before?: string | null;
  after?: string | null;
  note?: string | null;
}

export async function addMilestone(db: Db, m: NewMilestone, now: Date) {
  if (m.kind === "milestone") {
    if (!m.itemId) return { result: "needs_item" as const };
    const { data: item } = await db.from("items").select("tier").eq("id", m.itemId).maybeSingle();
    if (!item) return { result: "item_not_found" as const };
    if (item.tier !== "goal" && item.tier !== "dream") return { result: "not_a_goal_or_dream" as const, tier: item.tier };
  }
  // A moment in the past (or flagged as happened) is already achieved: it's history, not a plan.
  const happened = m.kind === "moment" && (m.happened || (m.date !== undefined && m.date !== null && m.date <= dayKey(now, tz())));
  const { data, error } = await db
    .from("milestones")
    .insert({
      kind: m.kind,
      title: m.title.trim(),
      item_id: m.itemId ?? null,
      on_date: m.date ?? null,
      status: happened ? "achieved" : "planned",
      achieved_on: happened ? m.date ?? dayKey(now, tz()) : null,
      before: m.before?.trim() || null,
      after: m.after?.trim() || null,
      note: m.note?.trim() || null,
    })
    .select("id, kind, title, status")
    .single();
  if (error) throw new Error(`adding: ${error.message}`);
  return { result: "added" as const, ...data };
}

/**
 * Hit a milestone: 3× its goal's or dream's base XP, to the pillars that goal's
 * tasks feed (or `weights` if there are none). Moments pay nothing.
 */
export async function achieveMilestone(db: Db, id: string, opts: { on?: string; weights?: PillarWeight[]; after?: string | null }, now: Date) {
  const { data: m } = await db.from("milestones").select("id, kind, title, status, item_id").eq("id", id).maybeSingle();
  if (!m) return { result: "not_found" as const };
  if (!canAchieve(m.status as MilestoneStatus)) return { result: `already_${m.status}` as const, title: m.title };
  let entries: ReturnType<typeof milestoneXp> = [];
  if (m.kind === "milestone" && m.item_id) {
    const inputs = await bonusInputs(db, m.item_id);
    const weights = opts.weights ?? inputs.weights;
    if (!weights) return { result: "needs_weights" as const, title: m.title };
    entries = milestoneXp(inputs.baseXp, weights);
  }
  const { data, error } = await db.rpc("achieve_milestone", { p_id: id, p_on: opts.on ?? dayKey(now, tz()), p_entries: entries as unknown as Json });
  if (error) throw new Error(`achieving: ${error.message}`);
  if (opts.after) await db.from("milestones").update({ after: opts.after.trim() }).eq("id", id);
  const res = (data as { result: string; xp_rows?: number }).result;
  return { result: res, title: m.title, xp: res === "achieved" && (data as { xp_rows: number }).xp_rows > 0 ? entries.reduce((s, e) => s + e.amount, 0) : 0 };
}

export async function updateMilestone(
  db: Db,
  ref: string,
  changes: { title?: string; date?: string | null; status?: "planned" | "dropped"; before?: string | null; after?: string | null; note?: string | null },
) {
  const isId = /^[0-9a-f-]{36}$/i.test(ref);
  const q = db.from("milestones").select("id, status");
  const { data: m } = await (isId ? q.eq("id", ref) : q.ilike("title", escapeLike(ref.trim()))).limit(1).maybeSingle();
  if (!m) return { result: "not_found" as const };
  const patch = {
    ...(changes.title !== undefined && { title: changes.title.trim() }),
    ...(changes.date !== undefined && { on_date: changes.date }),
    ...(changes.before !== undefined && { before: changes.before?.trim() || null }),
    ...(changes.after !== undefined && { after: changes.after?.trim() || null }),
    ...(changes.note !== undefined && { note: changes.note?.trim() || null }),
    // Back to planned clears the date it was hit; the ledger still won't pay it twice.
    ...(changes.status !== undefined && { status: changes.status, achieved_on: null }),
  };
  const { error } = await db.from("milestones").update(patch).eq("id", m.id);
  if (error) throw new Error(`updating: ${error.message}`);
  return { result: "updated" as const };
}
