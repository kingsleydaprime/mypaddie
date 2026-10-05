import { expect, test } from "bun:test";
import { safeNext } from "./safe-next";

test.each([
  ["/oauth/consent?authorization_id=abc", "/oauth/consent?authorization_id=abc"],
  ["/", "/"],
  ["https://evil.com", "/"],
  ["//evil.com/path", "/"],
  ["/\\evil.com", "/"],
  ["javascript:alert(1)", "/"],
  ["", "/"],
  [undefined, "/"],
  [["/a", "/b"], "/"],
])("safeNext(%p) → %p", (input, expected) => {
  expect(safeNext(input)).toBe(expected);
});
