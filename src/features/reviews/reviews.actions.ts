"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logDecision, reviewDecision, VERDICTS, type Verdict } from "@/features/decisions/decisions.repo";
import { requireDb } from "@/shared/supabase/session";
import { QUESTIONS, REVIEW_PERIODS, THEME_PERIODS, type ReviewPeriod, type ThemePeriod } from "./periods";
import { saveReview, setTheme } from "./reviews.repo";

export type ThemeState = null | { ok: true } | { error: string };
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export async function setThemeAction(_prev: ThemeState, form: FormData): Promise<ThemeState> {
  const period = String(form.get("period") ?? "") as ThemePeriod;
  const title = String(form.get("title") ?? "").trim();
  if (!THEME_PERIODS.includes(period) || !title) return { error: "Give it a name, e.g. Month of Mercies" };
  const db = await requireDb("/app/growth");
  await setTheme(db, { period, day: String(form.get("day")), title, focus: lines(form.get("focus")), notNow: lines(form.get("notNow")) });
  revalidatePath("/app/growth");
  revalidatePath("/app");
  return { ok: true };
}

export async function saveReviewAction(period: ReviewPeriod, day: string, form: FormData) {
  if (!REVIEW_PERIODS.includes(period)) return;
  const answers = Object.fromEntries(QUESTIONS[period].map((q) => [q.key, String(form.get(q.key) ?? "").trim()]).filter(([, v]) => v));
  const db = await requireDb("/app/growth");
  await saveReview(db, { period, day, answers });
  revalidatePath("/app/growth");
  redirect("/app/growth?saved=1");
}

export async function logDecisionAction(form: FormData) {
  const decision = String(form.get("decision") ?? "").trim();
  if (!decision) return;
  const db = await requireDb("/app/growth");
  await logDecision(db, { decision, why: String(form.get("why") ?? "") || null, expected: String(form.get("expected") ?? "") || null }, new Date());
  revalidatePath("/app/growth");
}

export async function reviewDecisionAction(id: string, verdict: Verdict) {
  if (!VERDICTS.includes(verdict)) return;
  const db = await requireDb("/app/growth");
  await reviewDecision(db, id, { verdict }, new Date());
  revalidatePath("/app/growth");
}
