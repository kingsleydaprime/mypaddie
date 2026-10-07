"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planErrorMessage } from "@/features/plans/action-error";
import { requireDb } from "@/shared/supabase/session";
import { APPLICATION_KINDS, isValidTimeZone, type ApplicationKind, type ApplicationStatus } from "./applications";
import { addApplication, changeRequirement, updateApplication } from "./applications.repo";

export type AppFormState = null | { error: string };

export async function addApplicationAction(_prev: AppFormState, form: FormData): Promise<AppFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const title = get("title");
  const kind = get("kind") as ApplicationKind;
  const date = get("date");
  const tz = get("tz") || "Africa/Lagos";
  if (!title) return { error: "Name it" };
  if (!APPLICATION_KINDS.includes(kind)) return { error: "Pick a kind" };
  if (date && !isValidTimeZone(tz)) return { error: `"${tz}" isn't a time zone name — try America/New_York or Europe/London` };
  const requirements = get("requirements").split(/\n|,/).map((r) => r.trim()).filter(Boolean).map((title) => ({ title }));

  const db = await requireDb("/app/applications");
  let created;
  try {
    created = await addApplication(
      db,
      {
        title,
        kind,
        org: get("org") || undefined,
        link: get("link") || undefined,
        deadline: date ? { date, time: get("time") || "23:59", timeZone: tz } : undefined,
        requirements,
      },
      new Date(),
    );
  } catch (e) {
    return { error: planErrorMessage(e) };
  }
  revalidatePath("/app/applications");
  redirect(`/app/applications/${created.id}`);
}

export async function setStatusAction(id: string, status: ApplicationStatus) {
  const db = await requireDb(`/app/applications/${id}`);
  await updateApplication(db, id, { status }, new Date());
  revalidatePath(`/app/applications/${id}`);
  revalidatePath("/app/applications");
}

export async function toggleRequirementAction(id: string, title: string, done: boolean) {
  const db = await requireDb(`/app/applications/${id}`);
  await changeRequirement(db, id, done ? { done: title } : { undone: title }, new Date());
  revalidatePath(`/app/applications/${id}`);
  revalidatePath("/app");
}

export async function addRequirementAction(id: string, form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const db = await requireDb(`/app/applications/${id}`);
  await changeRequirement(db, id, { add: [{ title }] }, new Date());
  revalidatePath(`/app/applications/${id}`);
}
