"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { adjustPantry, removePantryItem } from "./pantry.repo";

export type PantryFormState = null | { error: string } | { ok: string };

export async function stepItemAction(name: string, delta: number): Promise<PantryFormState> {
  const db = await requireDb("/pantry");
  try {
    await adjustPantry(db, [{ name, delta }]);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/pantry");
  return null;
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : Number(s);
};

/** Add a new item, or set an existing one's amount / low level / category. */
export async function saveItemAction(_prev: PantryFormState, form: FormData): Promise<PantryFormState> {
  const name = String(form.get("name") ?? "").trim();
  const unit = String(form.get("unit") ?? "").trim();
  const quantity = num(form.get("quantity"));
  const lowAt = num(form.get("low_at"));
  const category = String(form.get("category") ?? "").trim();
  if (!name) return { error: "Name it" };
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0)) return { error: "Amount must be 0 or more" };
  if (lowAt !== undefined && (!Number.isFinite(lowAt) || lowAt < 0)) return { error: "'Low at' must be 0 or more" };

  const db = await requireDb("/pantry");
  try {
    await adjustPantry(db, [
      {
        name,
        ...(unit ? { unit } : {}),
        ...(quantity !== undefined ? { set: quantity } : {}),
        ...(category ? { category } : {}),
        lowAt: lowAt ?? null,
      },
    ]);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/pantry");
  return { ok: "Saved." };
}

export async function removeItemAction(name: string) {
  const db = await requireDb("/pantry");
  await removePantryItem(db, name);
  revalidatePath("/pantry");
}
