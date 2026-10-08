import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import { summariseSeries, type SeriesRow } from "./overview";

/** How far back to look for a habit's latest row (matches catch-up's template lookback). */
const SERIES_LOOKBACK_DAYS = 60;
/** How far ahead "Coming up" looks. */
const UPCOMING_DAYS = 7;

export interface UpcomingTask {
  id: string;
  title: string;
  dueAt: Date;
  nonNegotiable: boolean;
}

/** Everything the Tasks tab shows beyond today: routines, habits, and one-offs in the next week. */
export async function loadTaskOverview(db: Db, now: Date, config = currentConfig()) {
  const today = dayKey(now, config.timeZone);
  const from = zonedInstant(addDays(today, 1), "00:00", config.timeZone).toISOString();
  const to = zonedInstant(addDays(today, UPCOMING_DAYS + 1), "00:00", config.timeZone).toISOString();
  const [{ data: rows, error: e1 }, { data: routines, error: e2 }, { data: oneOffs, error: e3 }] = await Promise.all([
    db
      .from("tasks")
      .select("id, series_id, title, recurrence, occurs_on, due_at, status, routine_id, routine_step")
      .not("series_id", "is", null)
      .gte("occurs_on", addDays(today, -SERIES_LOOKBACK_DAYS)),
    db.from("routines").select("id, title").order("created_at"),
    db
      .from("tasks")
      .select("id, title, due_at, is_non_negotiable")
      .is("series_id", null)
      .eq("status", "pending")
      .gte("due_at", from)
      .lt("due_at", to)
      .order("due_at"),
  ]);
  if (e1 || e2 || e3) throw new Error(`loading tasks: ${(e1 ?? e2 ?? e3)!.message}`);

  const series: SeriesRow[] = rows
    .filter((r) => r.series_id && r.occurs_on)
    .map((r) => ({
      id: r.id,
      seriesId: r.series_id!,
      title: r.title,
      recurrence: r.recurrence,
      occursOn: r.occurs_on!,
      dueAt: r.due_at ? new Date(r.due_at) : null,
      status: r.status,
      routine: r.routine_id ? { id: r.routine_id, step: r.routine_step ?? 0 } : null,
    }));
  const upcoming: UpcomingTask[] = oneOffs.map((t) => ({ id: t.id, title: t.title, dueAt: new Date(t.due_at!), nonNegotiable: t.is_non_negotiable }));
  return { ...summariseSeries(series, routines, now, config), upcoming };
}
