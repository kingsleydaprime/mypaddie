"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLARS } from "@/shared/domain";
import { requireDb } from "@/shared/supabase/session";
import { achieveMilestone, addMilestone } from "./life.repo";

const optional = z.string().trim().optional().transform((v) => v || null);

function back(path: string, message?: string): never {
  revalidatePath(path);
  revalidatePath("/app/life");
  redirect(message ? `${path}${path.includes("?") ? "&" : "?"}m=${encodeURIComponent(message)}` : path);
}

/** A milestone under a goal or dream (from its quest page), or a moment (from the timeline). */
export async function addMilestoneAction(form: FormData) {
  const v = z
    .object({
      back: z.string().startsWith("/app/"),
      kind: z.enum(["milestone", "moment"]),
      title: z.string().trim().min(1, "Name it"),
      item_id: optional.pipe(z.uuid().nullable()),
      date: optional.pipe(z.iso.date().nullable()),
      before: optional,
      after: optional,
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) back("/app/life", v.error.issues[0]?.message);
  const d = v.data;
  const res = await addMilestone(await requireDb(d.back), { kind: d.kind, title: d.title, itemId: d.item_id, date: d.date, before: d.before, after: d.after }, new Date());
  back(d.back, res.result === "added" ? undefined : "Couldn't add that one");
}

export async function achieveMilestoneAction(form: FormData) {
  const v = z.object({ id: z.uuid(), back: z.string().startsWith("/app/"), pillar: z.enum(PILLARS).optional() }).parse({
    id: form.get("id"),
    back: form.get("back"),
    pillar: form.get("pillar") || undefined,
  });
  const res = await achieveMilestone(await requireDb(v.back), v.id, { weights: v.pillar ? [{ pillar: v.pillar, weight: 100 }] : undefined }, new Date());
  if (res.result === "needs_weights") back(`${v.back}${v.back.includes("?") ? "&" : "?"}ask=${v.id}`);
  back(v.back, res.result === "achieved" ? (res.xp > 0 ? `Milestone hit. +${res.xp} XP.` : "Milestone hit.") : "Already done.");
}
