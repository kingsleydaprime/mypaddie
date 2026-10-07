"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { COMMITMENT_KINDS, COMMITMENT_PRIORITIES, type CommitmentKind, type CommitmentPriority, type CommitmentStatus } from "./commitments";
import { addCommitment, updateCommitment } from "./commitments.repo";

export type CommitmentFormState = null | { ok: true; message?: string } | { error: string };

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export async function addCommitmentAction(_prev: CommitmentFormState, form: FormData): Promise<CommitmentFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const kind = get("kind") as CommitmentKind;
  const priority = get("priority") as CommitmentPriority;
  const title = get("title");
  if (!title) return { error: "What's your role? e.g. Striker, Campus ambassador, Member" };
  if (!COMMITMENT_KINDS.includes(kind)) return { error: "Pick a kind" };
  const extra = get("extraHours") ? Number(get("extraHours")) : 0;
  if (!(extra >= 0 && extra <= 100)) return { error: "Unscheduled hours: 0–100 a week" };

  // One optional regular session from the form; more can be added by asking Paddie.
  const days = DAYS.filter((d) => form.get(`day-${d}`));
  const sessionTitle = get("sessionTitle");
  const minutes = get("sessionMinutes") ? Number(get("sessionMinutes")) : 0;
  if (days.length && (!sessionTitle || !(minutes >= 5 && minutes <= 720))) return { error: "A regular session needs a name and a length (5–720 min)" };

  const db = await requireDb("/app/commitments");
  const { sessions } = await addCommitment(
    db,
    {
      kind,
      title,
      org: get("org") || null,
      priority: COMMITMENT_PRIORITIES.includes(priority) ? priority : "important",
      extraMinutesPerWeek: Math.round(extra * 60),
      sessions: days.length ? [{ title: sessionTitle, recurrence: `FREQ=WEEKLY;BYDAY=${days.join(",")}`, time: get("sessionTime") || null, minutes }] : [],
    },
    new Date(),
  );
  revalidatePath("/app/commitments");
  revalidatePath("/app");
  const refused = sessions.find((s) => s.result !== "created");
  if (refused) return { ok: true, message: `Saved, but "${refused.session}" wasn't scheduled (${refused.result.replace("_", " ")}). Ask Paddie to fit it in.` };
  return { ok: true, message: "Saved." };
}

export async function setCommitmentAction(id: string, changes: { status?: CommitmentStatus; priority?: CommitmentPriority }) {
  const db = await requireDb("/app/commitments");
  await updateCommitment(db, id, changes, new Date());
  revalidatePath("/app/commitments");
  revalidatePath("/app");
}
