"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { undo } from "./undo.repo";

export type UndoState = { message: string } | { error: string } | null;

export async function undoAction(_prev: UndoState, form: FormData): Promise<UndoState> {
  const parsed = z.object({ kind: z.enum(["task", "fun", "workout", "learning", "slip"]), id: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Couldn't tell what to undo." };
  const db = await requireDb("/app/done");
  const res = await undo(db, parsed.data.kind, parsed.data.id);
  revalidatePath("/app/done");
  revalidatePath("/app");
  if (!("xp" in res)) return { error: "Already undone, or gone." };
  return { message: res.xp !== 0 ? `Undone. ${res.xp} XP.` : "Undone." };
}
