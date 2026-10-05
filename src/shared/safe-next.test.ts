import { expect, test } from "bun:test";
import { safeNext } from "./safe-next";

test.each([
  ["/oauth/consent?authorization_id=abc", "/oauth/consent?authorization_id=abc"],
  ["/", "/"],
  ["https://evil.com", "/app"],
  ["//evil.com/path", "/app"],
  ["/\\evil.com", "/app"],
  ["javascript:alert(1)", "/app"],
  ["", "/app"],
  [undefined, "/app"],
  [["/a", "/b"], "/app"],
])("safeNext(%p) → %p", (input, expected) => {
  expect(safeNext(input)).toBe(expected);
});
