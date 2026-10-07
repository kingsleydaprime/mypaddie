import { expect, test } from "bun:test";
import { parseValues, valuesText } from "./values";

test("one value per line, in order, with an optional why", () => {
  expect(parseValues("Faith — it anchors everything\nFamily: they come first\nHonesty")).toEqual([
    { value: "Faith", why: "it anchors everything" },
    { value: "Family", why: "they come first" },
    { value: "Honesty", why: null },
  ]);
});

test("list markers, blank lines and repeats (any case) are dropped", () => {
  expect(parseValues("1. Growth\n\n- growth\n* Courage - even when it's scary\n")).toEqual([
    { value: "Growth", why: null },
    { value: "Courage", why: "even when it's scary" },
  ]);
});

test("a hyphen inside a word isn't a separator", () => {
  expect(parseValues("Self-respect")).toEqual([{ value: "Self-respect", why: null }]);
});

test("valuesText round-trips through parseValues", () => {
  const values = [{ value: "Faith", why: "it anchors everything" }, { value: "Self-respect", why: null }];
  expect(parseValues(valuesText(values))).toEqual(values);
});
