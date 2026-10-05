import { describe, expect, test } from "bun:test";
import { isAllowedCalendarUrl, maskCalendarUrl, parseIcs } from "./ics";

const at = (local: string) => new Date(`${local}+01:00`);

// A small feed in Google's shape: a VTIMEZONE, a one-off, a weekly series with
// one occurrence moved and one excluded, a cancelled event, an all-day event,
// a UTC event and a floating one.
const FEED = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VTIMEZONE", "TZID:Africa/Lagos", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0100", "TZNAME:WAT", "END:STANDARD", "END:VTIMEZONE",
  "BEGIN:VEVENT", "UID:oneoff@google.com", "SUMMARY:Dentist", "DTSTART;TZID=Africa/Lagos:20261008T100000", "DTEND;TZID=Africa/Lagos:20261008T110000", "LOCATION:Lekki", "END:VEVENT",
  "BEGIN:VEVENT", "UID:standup@google.com", "SUMMARY:Standup", "DTSTART;TZID=Africa/Lagos:20261005T090000", "DTEND;TZID=Africa/Lagos:20261005T091500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;TZID=Africa/Lagos:20261012T090000", "END:VEVENT",
  "BEGIN:VEVENT", "UID:standup@google.com", "RECURRENCE-ID;TZID=Africa/Lagos:20261007T090000", "SUMMARY:Standup (moved)", "DTSTART;TZID=Africa/Lagos:20261007T110000", "DTEND;TZID=Africa/Lagos:20261007T111500", "END:VEVENT",
  "BEGIN:VEVENT", "UID:gone@google.com", "SUMMARY:Cancelled thing", "STATUS:CANCELLED", "DTSTART;TZID=Africa/Lagos:20261009T150000", "END:VEVENT",
  "BEGIN:VEVENT", "UID:holiday@google.com", "SUMMARY:Public holiday", "DTSTART;VALUE=DATE:20261009", "DTEND;VALUE=DATE:20261010", "END:VEVENT",
  "BEGIN:VEVENT", "UID:utc@google.com", "SUMMARY:Call with London", "DTSTART:20261009T130000Z", "DTEND:20261009T133000Z", "END:VEVENT",
  "BEGIN:VEVENT", "UID:floating@google.com", "SUMMARY:Floating", "DTSTART:20261010T080000", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  const list = parseIcs(FEED, at("2026-10-05T00:00:00"), at("2026-10-14T23:59:00"));
  const line = (o: (typeof list)[number]) => `${o.title}@${o.allDay ? "all-day" : o.startsAt.toISOString()}`;

  test("expands, moves, excludes and drops as the feed says", () => {
    expect(list.map(line)).toEqual([
      "Standup@2026-10-05T08:00:00.000Z",
      "Standup (moved)@2026-10-07T10:00:00.000Z", // moved from 09:00 to 11:00 Lagos
      "Dentist@2026-10-08T09:00:00.000Z",
      "Public holiday@all-day",
      "Call with London@2026-10-09T13:00:00.000Z",
      "Floating@2026-10-10T07:00:00.000Z", // 08:00 *Lagos*, not server time
      "Standup@2026-10-14T08:00:00.000Z", // 12 Oct excluded
    ]);
  });
  test("each occurrence has its own stable id", () => {
    const ids = list.filter((o) => o.title.startsWith("Standup")).map((o) => o.externalUid);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toStartWith("standup@google.com#");
  });
  test("ends and places come through", () => {
    const dentist = list.find((o) => o.title === "Dentist")!;
    expect(dentist).toMatchObject({ endsAt: at("2026-10-08T11:00:00"), location: "Lekki", allDay: false });
  });
  test("outside the window: nothing", () => {
    expect(parseIcs(FEED, at("2027-01-01T00:00:00"), at("2027-01-02T00:00:00")).filter((o) => o.title !== "Standup")).toEqual([]);
  });
});

describe("calendar URLs", () => {
  test("only Google Calendar iCal links are accepted", () => {
    expect(isAllowedCalendarUrl("https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc123/basic.ics")).toBe(true);
    expect(isAllowedCalendarUrl("http://calendar.google.com/calendar/ical/x/private-y/basic.ics")).toBe(false);
    expect(isAllowedCalendarUrl("https://evil.example/calendar/ical/x/basic.ics")).toBe(false);
    expect(isAllowedCalendarUrl("https://calendar.google.com.evil.example/calendar/ical/x/basic.ics")).toBe(false);
    expect(isAllowedCalendarUrl("https://calendar.google.com/admin")).toBe(false);
    expect(isAllowedCalendarUrl("not a url")).toBe(false);
  });
  test("the secret part is masked for display", () => {
    expect(maskCalendarUrl("https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc123def/basic.ics")).not.toContain("abc123def");
  });
});
