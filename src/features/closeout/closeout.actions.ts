"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { SLIP_REASONS } from "./closeout";
import { applyDecisions, closeDay } from "./closeout.repo";

const PAGE = "/app/close";

function back(message?: string): never {
  revalidatePath(PAGE);
  revalidatePath("/app");
  redirect(message ? `${PAGE}?m=${encodeURIComponent(message)}` : PAGE);
}

/** One open task: move it, drop it, or say why it slipped. */
export async function decideAction(form: FormData) {
  const parsed = z
    .discriminatedUnion("kind", [
      z.object({ id: z.uuid(), kind: z.literal("move"), to: z.iso.date("Pick a day") }),
      z.object({ id: z.uuid(), kind: z.literal("drop") }),
      z.object({ id: z.uuid(), kind: z.literal("slipped"), category: z.enum(SLIP_REASONS.map((r) => r.category) as [string, ...string[]]) }),
    ])
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Couldn't tell what to do");
  const d = parsed.data;
  const db = await requireDb(PAGE);
  const decision =
    d.kind === "move"
      ? { taskId: d.id, kind: "move" as const, to: d.to }
      : d.kind === "drop"
        ? { taskId: d.id, kind: "drop" as const }
        : { taskId: d.id, kind: "slipped" as const, why: SLIP_REASONS.find((r) => r.category === d.category)!.label, category: d.category };
  const { results } = await applyDecisions(db, [decision], new Date());
  const r = results[0];
  if (!r || ["updated", "cancelled", "recorded"].includes(r.result)) back();
  back(
    r.result === "clash" ? "That day has a clash at that time — pick another day." :
    r.result === "over_capacity" ? "That day is already full — pick another, or drop it." :
    r.result === "not_allowed" ? "That one can't be dropped — move it or say why." :
    r.result === "move_to_past" ? "Move it to a day after today." :
    "Couldn't do that one.",
  );
}

export async function closeDayAction(form: FormData) {
  const v = z.object({ win: z.string().trim().max(500).optional(), note: z.string().trim().max(1000).optional() }).parse(Object.fromEntries(form));
  const res = await closeDay(await requireDb(PAGE), { win: v.win || null, note: v.note || null }, new Date());
  back(res.result === "closed" ? `Day closed. +${res.xp} XP. See you tomorrow.` : "Updated.");
}
