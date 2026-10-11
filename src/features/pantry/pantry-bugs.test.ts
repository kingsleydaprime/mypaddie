/**
 * Bug condition exploration test — Property 1
 *
 * These tests encode the EXPECTED (fixed) behavior and MUST FAIL on unfixed code.
 * Failure here confirms both bugs exist. They become the fix-verification tests
 * in Task 3.4 once the fix is applied.
 *
 * Bug 1 — edit form missing unit field (Requirements 1.1, 1.2)
 * Bug 2 — `delete_pantry_item` MCP tool absent (Requirement 1.4)
 *
 * Validates: Requirements 1.1, 1.2, 1.4
 */

import { describe, test, expect, mock, beforeAll } from "bun:test";

// ── Module stubs (must come before any import that transitively touches them) ──

// next/cache is used by pantry.actions.ts ("use server")
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
// next/navigation is used by session.ts
mock.module("next/navigation", () => ({ redirect: () => {} }));
// Supabase session – the server action needs requireDb but we never call the action
mock.module("@/shared/supabase/session", () => ({ requireDb: async () => ({}) }));
// Repo – not needed; stubs prevent any DB import from exploding
mock.module("@/features/pantry/pantry.repo", () => ({
  adjustPantry: async () => [],
  removePantryItem: async () => {},
  loadPantry: async () => [],
  cookMeal: async () => ({}),
  recentMeals: async () => [],
}));
mock.module("@/features/pantry/meals.repo", () => ({ afterCooking: async () => ({}) }));
mock.module("@/features/mode/mode.repo", () => ({ withMode: async (_db: unknown, _d: unknown, v: unknown) => v }));
mock.module("@/shared/mcp/kit", () => ({
  dbFrom: () => ({}),
  ok: (v: unknown) => ({ content: [{ type: "text", text: JSON.stringify(v) }] }),
  toolError: (msg: string) => ({ isError: true, content: [{ type: "text", text: msg }] }),
}));
// react-dom for useFormStatus (used by SubmitButton)
mock.module("react-dom", () => {
  const actual = require("react-dom");
  return { ...actual, useFormStatus: () => ({ pending: false, data: null }) };
});
// react hooks — force `editing=true` so the edit form renders.
// `editing` is the only boolean useState in PantryItemRow; matching on the
// boolean type is more stable than relying on call-order counts.
mock.module("react", () => {
  const actual = require("react");
  return {
    ...actual,
    useState: (init: unknown) => {
      if (typeof init === "boolean") return [true, () => {}]; // editing = true
      return [typeof init === "function" ? (init as () => unknown)() : init, () => {}];
    },
    useTransition: () => [false, (fn: () => void) => fn()],
    useActionState: (_fn: unknown, init: unknown) => [init, async () => {}, false],
  };
});

// ── Imports (after mocks are set up) ──

import React from "react";
import { McpServer } from "@modelcontextprotocol/server";
import { PantryItemRow } from "./ui/pantry-item";
import { registerPantryTools } from "./pantry.tools";
import type { PantryItem } from "./pantry";

// ── Helpers ──

/**
 * Walk a React element tree and collect the `name` attributes of every
 * <input> and <select> element. Works without a DOM — React elements are
 * plain objects. Calls function components to get their rendered children.
 */
function collectFormFieldNames(el: unknown): string[] {
  if (el === null || el === undefined || typeof el !== "object") return [];
  if (Array.isArray(el)) return el.flatMap((c) => collectFormFieldNames(c));

  const node = el as { $$typeof?: unknown; type?: unknown; props?: Record<string, unknown> };
  const results: string[] = [];

  if (node.$$typeof) {
    // Function component — invoke it so we see its rendered output
    if (typeof node.type === "function" && node.props) {
      try {
        const rendered = (node.type as (props: unknown) => unknown)(node.props);
        results.push(...collectFormFieldNames(rendered));
      } catch {
        // ignore hooks that throw outside a renderer (e.g. useFormStatus)
      }
    }
    // Host element (div, form, input, select…)
    if (typeof node.type === "string") {
      if ((node.type === "input" || node.type === "select") && node.props?.name) {
        results.push(node.props.name as string);
      }
      if (node.props?.children !== undefined) {
        results.push(...collectFormFieldNames(node.props.children));
      }
    }
  } else {
    for (const value of Object.values(node)) {
      results.push(...collectFormFieldNames(value));
    }
  }

  return results;
}

/** Collect all tool names registered on an McpServer by monkey-patching registerTool. */
function collectRegisteredToolNames(server: McpServer): { names: string[] } {
  const names: string[] = [];
  const original = server.registerTool.bind(server);
  (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (
    name: unknown,
    ...rest: unknown[]
  ) => {
    names.push(name as string);
    return (original as (...a: unknown[]) => unknown)(name, ...rest);
  };
  return { names };
}

// ── Test data ──

const rice: PantryItem = {
  name: "Rice",
  unit: "grams",
  quantity: 2,
  category: "grains",
  lowAt: null,
};

// ── Bug condition exploration tests ──

describe("Bug condition exploration — Property 1", () => {
  /**
   * Bug 1 — Edit form missing unit field
   *
   * PantryItemRow renders a form when `editing` is true. The fix adds
   * `<input name="unit">` to that form. On unfixed code this assertion FAILS
   * because no such input exists — confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  test("Bug 1: edit form renders <input name='unit'> (FAILS on unfixed code)", () => {
    // Call the component as a function (hooks are mocked above) to get its
    // rendered React element tree with editing=true.
    const rendered = (PantryItemRow as (props: { item: PantryItem }) => unknown)({ item: rice });
    const fieldNames = collectFormFieldNames(rendered);
    // Expected (fixed) behavior: the edit form contains a unit field.
    // COUNTEREXAMPLE on unfixed code: "unit" is absent from fieldNames.
    expect(fieldNames).toContain("unit");
  });

  /**
   * Bug 2 — `delete_pantry_item` MCP tool not registered
   *
   * After `registerPantryTools` runs, the tool registry must include
   * `delete_pantry_item`. On unfixed code this assertion FAILS because the
   * tool is never registered — confirming the bug.
   *
   * Validates: Requirement 1.4
   */
  test("Bug 2: registerPantryTools registers 'delete_pantry_item' (FAILS on unfixed code)", () => {
    const server = new McpServer({ name: "test", version: "1" });
    const { names } = collectRegisteredToolNames(server);
    registerPantryTools(server);
    // Expected (fixed) behavior: delete_pantry_item is registered.
    // COUNTEREXAMPLE on unfixed code: "delete_pantry_item" is absent from names.
    expect(names).toContain("delete_pantry_item");
  });
});
