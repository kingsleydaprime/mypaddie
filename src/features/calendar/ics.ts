import ICAL from "ical.js";
import { DEFAULT_CONFIG, type EngineConfig } from "@/shared/config";
import { zonedInstant } from "@/shared/time";

/** Only Google Calendar's private iCal links: the server fetches this URL, so it must not be arbitrary (SSRF). */
export function isAllowedCalendarUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && u.hostname === "calendar.google.com" && u.pathname.startsWith("/calendar/ical/") && u.pathname.endsWith(".ics");
  } catch {
    return false;
  }
}

/** For display: never show the secret part of the link. */
export const maskCalendarUrl = (raw: string) => raw.replace(/(\/private-)[^/]+/, "$1••••••").replace(/(\/ical\/)([^/]{4})[^/]*/, "$1$2••••");

export interface ImportedOccurrence {
  /** UID + occurrence start: stable across syncs, unique per occurrence. */
  externalUid: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
}

function toInstant(t: ICAL.Time, config: EngineConfig): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  if (t.isDate) return zonedInstant(day, "00:00", config.timeZone);
  // "Floating" times have no zone: they mean his local time, not the server's.
  if (!t.zone || t.zone.tzid === "floating") return zonedInstant(day, `${pad(t.hour)}:${pad(t.minute)}`, config.timeZone);
  return t.toJSDate();
}

/**
 * Concrete occurrences between `from` and `to` from an iCal feed: recurring
 * events expanded (EXDATEs skipped, moved occurrences applied), cancelled ones
 * dropped. Time zones come from the feed's own VTIMEZONE blocks.
 */
export function parseIcs(text: string, from: Date, to: Date, config: EngineConfig = DEFAULT_CONFIG): ImportedOccurrence[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(vevent);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  const out: ImportedOccurrence[] = [];
  const cancelled = (e: ICAL.Event) => String(e.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, key: string) => {
    if (cancelled(ev)) return;
    const startsAt = toInstant(start, config);
    if (startsAt < from || startsAt > to) return;
    out.push({
      externalUid: key,
      title: ev.summary?.trim() || "(no title)",
      startsAt,
      endsAt: end && !start.isDate ? toInstant(end, config) : null,
      allDay: start.isDate,
      location: ev.location?.trim() || null,
    });
  };

  for (const ev of masters.values()) {
    if (cancelled(ev)) continue;
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate, ev.uid);
      continue;
    }
    const it = ev.iterator();
    for (let next = it.next(), guard = 0; next && guard < 5000; next = it.next(), guard++) {
      const details = ev.getOccurrenceDetails(next);
      const startsAt = toInstant(details.startDate, config);
      if (startsAt > to) break;
      push(details.item, details.startDate, details.endDate, `${ev.uid}#${details.recurrenceId.toString()}`);
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
