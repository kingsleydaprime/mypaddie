import { expect, test } from "bun:test";
import { normalizeCategory } from "./library";

test("favourite categories: one spelling each", () => {
  expect(normalizeCategory("Favourite Songs")).toBe("song");
  expect(normalizeCategory("favorite food")).toBe("food");
  expect(normalizeCategory("Artist")).toBe("artist");
  expect(normalizeCategory("   ")).toBe("other");
});
