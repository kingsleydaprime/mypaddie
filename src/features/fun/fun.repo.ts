import { loadBudget } from "@/features/money/money.repo";
import { loadMode } from "@/features/mode/mode.repo";
import { completeTask, createTask, type CompleteResult } from "@/features/tasks/tasks.repo";
import { escapeLike } from "@/shared/supabase/like";
import type { Db } from "@/shared/supabase/token-client";
import { daysSinceFun, FUN_BASE_XP, funWeights, suggestFun, type FunActivity, type FunCompany, type FunContext, type FunEnergy } from "./fun";

const COLUMNS = "id, title, notes, cost, minutes, energy, company, active, times_done, last_done_at, created_at";

type FunRow = {
  id: string;
  title: string;
  notes: string | null;
  cost: number;
  minutes: number | null;
  energy: string;
  company: string;
  active: boolean;
  times_done: number;
  last_done_at: string | null;
  created_at: string;
};

const toActivity = (r: FunRow): FunActivity => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  cost: r.cost,
  minutes: r.minutes,
  energy: r.energy as FunEnergy,
  company: r.company as FunCompany,
  active: r.active,
  timesDone: r.times_done,
  lastDoneAt: r.last_done_at ? new Date(r.last_done_at) : null,
  createdAt: new Date(r.created_at),
});

export async function loadFun(db: Db): Promise<FunActivity[]> {
  const { data, error } = await db.from("fun_activities").select(COLUMNS).order("title");
  if (error) throw new Error(`loading the fun list: ${error.message}`);
  return (data as FunRow[]).map(toActivity);
}

/** By id, or by title case-insensitively ("movie night" finds "Movie night"). */
export async function findFun(db: Db, ref: string): Promise<FunActivity | null> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const query = db.from("fun_activities").select(COLUMNS);
  const { data, error } = await (isId ? query.eq("id", ref) : query.ilike("title", escapeLike(ref.trim()))).maybeSingle();
  if (error) throw new Error(`finding the activity: ${error.message}`);
  return data ? toActivity(data as FunRow) : null;
}

export interface FunInput {
  title: string;
  notes?: string | null;
  cost?: number;
  minutes?: number | null;
  energy?: FunEnergy;
  company?: FunCompany;
}

export async function addFun(db: Db, input: FunInput) {
  const { data, error } = await db
    .from("fun_activities")
    .insert({
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      cost: input.cost ?? 0,
      minutes: input.minutes ?? null,
      energy: input.energy ?? "medium",
      company: input.company ?? "either",
    })
    .select(COLUMNS)
    .single();
  if (error?.code === "23505") return { result: "exists" as const, title: input.title.trim() };
  if (error) throw new Error(`adding the activity: ${error.message}`);
  return { result: "added" as const, activity: toActivity(data as FunRow) };
}

export async function updateFun(db: Db, ref: string, changes: Partial<FunInput> & { active?: boolean; remove?: boolean }) {
  const fun = await findFun(db, ref);
  if (!fun) return { result: "not_found" as const };
  if (changes.remove) {
    // Past fun stays on the record: its tasks keep their XP and just lose the link.
    const { error } = await db.from("fun_activities").delete().eq("id", fun.id);
    if (error) throw new Error(`removing the activity: ${error.message}`);
    return { result: "removed" as const, title: fun.title };
  }
  const { error } = await db
    .from("fun_activities")
    .update({
      ...(changes.title ? { title: changes.title.trim() } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes?.trim() || null } : {}),
      ...(changes.cost !== undefined ? { cost: changes.cost } : {}),
      ...(changes.minutes !== undefined ? { minutes: changes.minutes } : {}),
      ...(changes.energy ? { energy: changes.energy } : {}),
      ...(changes.company ? { company: changes.company } : {}),
      ...(changes.active !== undefined ? { active: changes.active } : {}),
    })
    .eq("id", fun.id);
  if (error?.code === "23505") return { result: "exists" as const, title: changes.title };
  if (error) throw new Error(`updating the activity: ${error.message}`);
  return { result: "updated" as const, title: changes.title?.trim() ?? fun.title };
}

/**
 * Records fun that happened: a task completed on the spot, so XP flows the
 * usual way (and can't be paid twice), and completing it marks the activity
 * done. Something not on the list yet is added to it.
 */
export async function logFun(
  db: Db,
  input: { activity: string; withPeople?: boolean; minutes?: number | null },
  now: Date,
): Promise<{ activity: string; added: boolean; completed: CompleteResult }> {
  let fun = await findFun(db, input.activity);
  let added = false;
  if (!fun) {
    const created = await addFun(db, { title: input.activity, minutes: input.minutes ?? null, company: input.withPeople === undefined ? "either" : input.withPeople ? "together" : "solo" });
    if (created.result !== "added") throw new Error("could not add the activity");
    fun = created.activity;
    added = true;
  }
  const withPeople = input.withPeople ?? fun.company === "together";
  const task = await createTask(
    db,
    {
      title: `Fun: ${fun.title}`,
      itemId: null,
      baseXp: FUN_BASE_XP,
      // Undated: it already happened, so no capacity check for it.
      dueDate: null,
      dueTime: null,
      recurrence: null,
      nonNegotiable: false,
      weights: funWeights(withPeople),
      durationMinutes: input.minutes ?? fun.minutes,
      funActivityId: fun.id,
    },
    now,
  );
  if (task.result !== "created") throw new Error("could not record the fun");
  return { activity: fun.title, added, completed: await completeTask(db, task.task.id, now) };
}

/** The list, days since any fun, and what fits right now (money, mood, time). */
export async function loadFunPicture(db: Db, now: Date, opts: { minutesFree?: number | null; withPeople?: boolean | null; limit?: number } = {}) {
  const [activities, budget, mode] = await Promise.all([loadFun(db), loadBudget(db, now), loadMode(db, now)]);
  const stage = budget.stage.stage;
  const ctx: FunContext = {
    now,
    minutesFree: opts.minutesFree ?? null,
    stage,
    // The audit has no budgets yet; afterwards the wants envelope is the limit.
    wantsLeft: stage === "audit" ? null : budget.buckets.wants,
    mode: mode.mode,
    withPeople: opts.withPeople ?? null,
  };
  return {
    activities,
    daysSinceFun: daysSinceFun(activities, now),
    suggestions: suggestFun(activities, ctx, opts.limit ?? 3),
    budget: { stage, wantsLeft: ctx.wantsLeft },
    mode,
  };
}
