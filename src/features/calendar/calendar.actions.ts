"use server";

import { revalidatePath } from "next/cache";
import { requireDb } from "@/shared/supabase/session";
import { connectCalendar, disconnectCalendar, syncCalendar } from "./calendar.repo";

export type CalendarState = null | { error: string } | { ok: string };

function said(r: Awaited<ReturnType<typeof syncCalendar>> | { result: "rejected"; error: string }): CalendarState {
  switch (r.result) {
    case "synced":
      return { ok: `Synced: ${r.imported} events in the next 60 days.` };
    case "error":
    case "rejected":
      return { error: r.error };
    case "not_connected":
      return { error: "No calendar connected." };
    default:
      return { ok: "Up to date." };
  }
}

export async function connectCalendarAction(_prev: CalendarState, form: FormData): Promise<CalendarState> {
  const db = await requireDb("/app/settings");
  const r = await connectCalendar(db, String(form.get("url") ?? ""), new Date());
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return said(r);
}

export async function syncCalendarAction(): Promise<CalendarState> {
  const db = await requireDb("/app/settings");
  const r = await syncCalendar(db, new Date(), { force: true });
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return said(r);
}

export async function disconnectCalendarAction(): Promise<CalendarState> {
  const db = await requireDb("/app/settings");
  const r = await disconnectCalendar(db);
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: `Disconnected. Removed ${r.removedEvents} imported events.` };
}
