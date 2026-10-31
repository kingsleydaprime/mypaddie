import { expect, test } from "bun:test";
import { formatFor, normalizeCategory } from "./library";

test("favourite categories: one spelling each", () => {
  expect(normalizeCategory("Favourite Songs")).toBe("song");
  expect(normalizeCategory("favorite food")).toBe("food");
  expect(normalizeCategory("Artist")).toBe("artist");
  expect(normalizeCategory("   ")).toBe("other");
});

test("a book keeps its format: hard copy, PDF / e-book or audiobook", () => {
  expect(formatFor("book", "print")).toBe("print");
  expect(formatFor("book", "ebook")).toBe("ebook");
  expect(formatFor("book", "audio")).toBe("audio");
});

test("format is optional, and unknown ones are dropped rather than guessed", () => {
  expect(formatFor("book", "")).toBeNull();
  expect(formatFor("book", null)).toBeNull();
  expect(formatFor("book", "kindle")).toBeNull();
});

test("only books have a format — a film has no hard copy", () => {
  expect(formatFor("movie", "print")).toBeNull();
  expect(formatFor("podcast", "audio")).toBeNull();
});
