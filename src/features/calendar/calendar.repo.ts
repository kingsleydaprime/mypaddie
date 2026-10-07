import type { Json } from "@/shared/supabase/database.types";
import { requireFeature } from "@/features/plans/guard";
import type { Db } from "@/shared/supabase/token-client";
import { isAllowedCalendarUrl, maskCalendarUrl, parseIcs } from "./ics";

const KEY = "calendar";
const DAY = 86_400_000;
/** How far ahead to mirror, and how stale a sync may be before Today refreshes it. */
const AHEAD_DAYS = 60;
const STALE_MS = 30 * 60_000;
const MAX_BYTES = 5_000_000;

interface CalendarSetting {
  url: string;
  lastSyncAt?: string;
  lastCount?: number;
  lastError?: string | null;
}

async function load(db: Db): Promise<CalendarSetting | null> {
  const { data } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
  const v = data?.value as Partial<CalendarSetting> | undefined;
  return v?.url ? (v as CalendarSetting) : null;
}

async function save(db: Db, s: CalendarSetting) {
  const { error } = await db.from("settings").upsert({ key: KEY, value: s as unknown as { [k: string]: Json } }, { onConflict: "user_id,key" });
  if (error) throw new Error(`saving calendar settings: ${error.message}`);
}

/** What the app and tools may show: never the secret link itself. */
export async function calendarStatus(db: Db) {
  const s = await load(db);
  return s ? { connected: true, url: maskCalendarUrl(s.url), lastSyncAt: s.lastSyncAt ?? null, lastCount: s.lastCount ?? null, lastError: s.lastError ?? null } : { connected: false as const };
}

async function fetchFeed(url: string): Promise<string> {
  // No redirects: a link that bounces elsewhere could point the server anywhere.
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "text/calendar" } });
  if (!res.ok) throw new Error(res.status === 404 ? "Google says that link doesn't exist (reset or deleted?)" : `Google answered ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("the calendar feed is too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("the calendar feed is too large");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link didn't return a calendar");
  return text;
}

/**
 * Mirror the next 60 days of his Google Calendar into events: new occurrences
 * added, changed ones updated, deleted ones removed. Never touches `important`
 * — that's his call, made in MyPaddie. Skipped if synced in the last 30
 * minutes unless forced. Failures are recorded, not thrown, so Today still loads.
 */
export async function syncCalendar(db: Db, now: Date, opts: { force?: boolean } = {}) {
  const setting = await load(db);
  if (!setting) return { result: "not_connected" as const };
  if (!opts.force && setting.lastSyncAt && now.getTime() - Date.parse(setting.lastSyncAt) < STALE_MS) return { result: "fresh" as const };

  try {
    const from = new Date(now.getTime() - DAY);
    const to = new Date(now.getTime() + AHEAD_DAYS * DAY);
    const occurrences = parseIcs(await fetchFeed(setting.url), from, to);

    if (occurrences.length) {
      const { error } = await db.from("events").upsert(
        occurrences.map((o) => ({
          title: o.title,
          kind: o.allDay ? "other" : "meeting",
          starts_at: o.startsAt.toISOString(),
          ends_at: o.endsAt?.toISOString() ?? null,
          all_day: o.allDay,
          location: o.location,
          // No status or `important` here: new rows default to upcoming, and his
          // own decisions on existing ones (cancelled, important) are kept.
          source: "google",
          external_uid: o.externalUid,
        })),
        { onConflict: "user_id,external_uid" },
      );
      if (error) throw new Error(`saving events: ${error.message}`);
    }

    // Removed from Google (within the window) → removed here.
    const keep = new Set(occurrences.map((o) => o.externalUid));
    const { data: existing } = await db.from("events").select("id, external_uid").eq("source", "google").gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString());
    const stale = (existing ?? []).filter((e) => e.external_uid && !keep.has(e.external_uid)).map((e) => e.id);
    if (stale.length) await db.from("events").delete().in("id", stale);

    await save(db, { ...setting, lastSyncAt: now.toISOString(), lastCount: occurrences.length, lastError: null });
    return { result: "synced" as const, imported: occurrences.length, removed: stale.length };
  } catch (e) {
    const message = (e as Error).name === "TimeoutError" ? "Google took too long to answer" : (e as Error).message;
    await save(db, { ...setting, lastSyncAt: now.toISOString(), lastError: message });
    return { result: "error" as const, error: message };
  }
}

export async function connectCalendar(db: Db, url: string, now: Date) {
  requireFeature("calendarImport");
  const clean = url.trim();
  if (!isAllowedCalendarUrl(clean)) {
    return { result: "rejected" as const, error: "Use the 'Secret address in iCal format' from Google Calendar settings (it starts https://calendar.google.com/calendar/ical/ and ends .ics)." };
  }
  await save(db, { url: clean });
  return syncCalendar(db, now, { force: true });
}

export async function disconnectCalendar(db: Db) {
  await db.from("settings").delete().eq("key", KEY);
  const { data } = await db.from("events").delete().eq("source", "google").select("id");
  return { result: "disconnected" as const, removedEvents: data?.length ?? 0 };
}
