"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { METRICS, type Metric } from "./metrics";
import { CONCLUSIONS, finishExperiment, logCheckin, startExperiment, type Conclusion } from "./metrics.repo";

/** A number from the form, inside [min, max]; blank or out of range = not given. */
const num = (form: FormData, key: string, min: number, max: number) => {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export async function checkinAction(form: FormData) {
  const db = await requireDb("/app");
  const screenHours = num(form, "screen", 0, 24);
  await logCheckin(
    db,
    {
      energy: num(form, "energy", 1, 5),
      mood: num(form, "mood", 1, 5),
      sleepHours: ((h) => (h === undefined ? undefined : Math.round(h * 10) / 10))(num(form, "sleep", 0, 24)),
      screenMinutes: screenHours === undefined ? undefined : Math.round(screenHours * 60),
    },
    new Date(),
  );
  revalidatePath("/app");
  revalidatePath("/app/stats/trends");
}

export async function startExperimentAction(form: FormData) {
  const change = String(form.get("change") ?? "").trim().slice(0, 200);
  if (!change) return;
  const metric = String(form.get("metric") ?? "") as Metric;
  const db = await requireDb("/app/stats/trends");
  await startExperiment(
    db,
    { change, question: String(form.get("question") ?? "").slice(0, 300) || null, metric: METRICS.includes(metric) ? metric : null, days: num(form, "days", 3, 90) ?? 14 },
    new Date(),
  );
  revalidatePath("/app/stats/trends");
}

export async function finishExperimentAction(id: string, conclusion: Conclusion | "abandon") {
  if (conclusion !== "abandon" && !CONCLUSIONS.includes(conclusion)) return;
  const db = await requireDb("/app/stats/trends");
  await finishExperiment(db, id, conclusion === "abandon" ? { conclusion: "unclear", abandon: true } : { conclusion }, new Date());
  revalidatePath("/app/stats/trends");
}
