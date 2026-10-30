import { expect, test } from "bun:test";
import { BUILT_IN_QUOTES, parseQuote, quoteOfTheDay, type Quote } from "./quotes";

const mine: Quote[] = [
  { text: "Keep going.", author: "Mum" },
  { text: "Small steps.", author: null },
];

/** Every day in October 2026. */
const october = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

test("the same day always gives the same quote", () => {
  expect(quoteOfTheDay(mine, "2026-10-30")).toEqual(quoteOfTheDay(mine, "2026-10-30"));
});

test("with none of their own, it's always a built-in quote", () => {
  for (const day of october) expect(BUILT_IN_QUOTES).toContainEqual(quoteOfTheDay([], day)!);
});

test("their own quotes come up on most days, but built-in ones still appear", () => {
  const picks = october.map((d) => quoteOfTheDay(mine, d)!);
  const own = picks.filter((q) => mine.includes(q)).length;
  expect(own).toBeGreaterThan(picks.length / 2);
  expect(own).toBeLessThan(picks.length);
});

test("the quote changes across days", () => {
  expect(new Set(october.map((d) => quoteOfTheDay([], d)!.text)).size).toBeGreaterThan(5);
});

test("their own quotes only, when the built-in set is empty", () => {
  for (const day of october) expect(mine).toContainEqual(quoteOfTheDay(mine, day, [])!);
  expect(quoteOfTheDay([], "2026-10-30", [])).toBeNull();
});

test("a pasted quote splits on a dash before the author and loses its quote marks", () => {
  expect(parseQuote("“Keep going.” — Mum")).toEqual({ text: "Keep going.", author: "Mum" });
  expect(parseQuote("Discipline is freedom - Jocko Willink")).toEqual({ text: "Discipline is freedom", author: "Jocko Willink" });
  expect(parseQuote("Just keep moving")).toEqual({ text: "Just keep moving", author: null });
});

test("a hyphen inside a word isn't an author separator, and blanks are nothing", () => {
  expect(parseQuote("Self-respect is earned")).toEqual({ text: "Self-respect is earned", author: null });
  expect(parseQuote("   ")).toBeNull();
});
