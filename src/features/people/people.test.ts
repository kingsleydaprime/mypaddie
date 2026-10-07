import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { CONTACT_WEIGHTS, contactXp, daysSinceContact, daysToBirthday, reachOutDue, whoToReachOut, type PersonLike } from "./people";

const at = (local: string) => new Date(`${local}+01:00`);
const now = at("2026-10-14T12:00:00");
const p = (name: string, extra: Partial<PersonLike> = {}): PersonLike => ({ name, close: false, reachOutEveryDays: null, lastContactAt: null, createdAt: at("2026-09-01T10:00:00"), birthday: null, ...extra });

describe("people", () => {
  test("weights are valid; a call is worth more than a text", () => {
    expect(() => validateWeights(CONTACT_WEIGHTS)).not.toThrow();
    expect(contactXp("call")).toBeGreaterThan(contactXp("text"));
  });
  test("days since contact counts calendar days, from when they were added if never", () => {
    expect(daysSinceContact(p("Ada", { lastContactAt: at("2026-10-13T23:30:00") }), now)).toBe(1);
    expect(daysSinceContact(p("New"), now)).toBe(43);
  });
  test("due when the rhythm says so", () => {
    expect(reachOutDue(p("Mum", { reachOutEveryDays: 7, lastContactAt: at("2026-10-07T09:00:00") }), now)).toEqual({ overdueBy: 0 });
    expect(reachOutDue(p("Mum", { reachOutEveryDays: 7, lastContactAt: at("2026-10-08T09:00:00") }), now)).toBeNull();
    expect(reachOutDue(p("Tobi", { reachOutEveryDays: 14, lastContactAt: at("2026-09-20T09:00:00") }), now)).toEqual({ overdueBy: 10 });
    expect(reachOutDue(p("No rhythm"), now)).toBeNull();
  });
  test("who first: most overdue, close people ahead on a tie", () => {
    const list = [
      p("A", { reachOutEveryDays: 7, lastContactAt: at("2026-10-05T09:00:00") }),
      p("B", { reachOutEveryDays: 7, lastContactAt: at("2026-10-05T09:00:00"), close: true }),
      p("C", { reachOutEveryDays: 30, lastContactAt: at("2026-08-01T09:00:00") }),
      p("D", { reachOutEveryDays: 30, lastContactAt: at("2026-10-01T09:00:00") }),
    ];
    expect(whoToReachOut(list, now).map((x) => x.person.name)).toEqual(["C", "B", "A"]);
  });
  test("birthdays: this year or next, 29 Feb on the 28th in other years", () => {
    expect(daysToBirthday("1999-10-14", now)).toBe(0);
    expect(daysToBirthday("2001-10-20", now)).toBe(6);
    expect(daysToBirthday("2001-10-01", now)).toBe(352);
    expect(daysToBirthday("2004-02-29", at("2027-02-27T12:00:00"))).toBe(1);
  });
});
