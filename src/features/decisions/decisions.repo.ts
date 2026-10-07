import { completeTask, createTask, updateTask } from "@/features/tasks/tasks.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey } from "@/shared/time";

export const VERDICTS = ["worked", "partly", "didnt"] as const;
export type Verdict = (typeof VERDICTS)[number];

const COLUMNS = "id, decision, why, expected, decided_on, review_on, verdict, outcome, reviewed_at, task_id";

/**
 * A decision worth checking later: what, why, what you expect. With a review
 * date (default 30 days), "Review: …" lands on Today then, so future-you finds
 * out whether it worked.
 */
export async function logDecision(db: Db, input: { decision: string; why?: string | null; expected?: string | null; reviewInDays?: number | null }, now: Date) {
  const today = dayKey(now, currentConfig().timeZone);
  const reviewOn = input.reviewInDays === null ? null : addDays(today, input.reviewInDays ?? 30);
  let taskId: string | null = null;
  if (reviewOn) {
    const t = await createTask(
      db,
      { title: `Review: ${input.decision.trim()}`.slice(0, 200), itemId: null, baseXp: 10, dueDate: reviewOn, dueTime: null, recurrence: null, nonNegotiable: false, weights: [{ pillar: "character", weight: 60 }, { pillar: "mental", weight: 40 }], durationMinutes: 10 },
      now,
    );
    taskId = t.result === "created" ? t.task.id : null;
  }
  const { data, error } = await db
    .from("decisions")
    .insert({ decision: input.decision.trim(), why: input.why?.trim() || null, expected: input.expected?.trim() || null, decided_on: today, review_on: reviewOn, task_id: taskId })
    .select("id")
    .single();
  if (error) throw new Error(`saving the decision: ${error.message}`);
  return { result: "logged" as const, id: data.id, reviewOn };
}

export async function loadDecisions(db: Db, now: Date) {
  const { data, error } = await db.from("decisions").select(COLUMNS).order("decided_on", { ascending: false });
  if (error) throw new Error(`loading decisions: ${error.message}`);
  const today = dayKey(now, currentConfig().timeZone);
  return data.map((d) => ({ ...d, dueForReview: !d.reviewed_at && d.review_on !== null && d.review_on <= today }));
}

/** How it turned out. Completes its review task (XP for looking back honestly). */
export async function reviewDecision(db: Db, id: string, input: { verdict: Verdict; outcome?: string | null }, now: Date) {
  const { data: d } = await db.from("decisions").select("id, task_id").eq("id", id).maybeSingle();
  if (!d) return { result: "not_found" as const };
  await db.from("decisions").update({ verdict: input.verdict, outcome: input.outcome?.trim() || null, reviewed_at: now.toISOString() }).eq("id", id);
  if (d.task_id) {
    const c = await completeTask(db, d.task_id, now);
    if (c.result === "not_found") await updateTask(db, d.task_id, {}, "cancel", now);
  }
  return { result: "reviewed" as const, verdict: input.verdict };
}

export async function removeDecision(db: Db, id: string, now: Date) {
  const { data: d } = await db.from("decisions").select("task_id").eq("id", id).maybeSingle();
  if (d?.task_id) await updateTask(db, d.task_id, {}, "cancel", now);
  await db.from("decisions").delete().eq("id", id);
  return { result: "removed" as const };
}
