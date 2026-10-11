/**
 * Preservation property tests — Property 2
 *
 * These tests run on UNFIXED code and MUST PASS — they encode the baseline
 * behavior that the fix must not regress.
 *
 * Three layers of preservation:
 *  A. Edit form non-unit fields (quantity, low-at, category) reach saveItemAction
 *     with their correct values; the current unit survives unchanged (Req 3.1, 3.2)
 *  B. Pure pantry logic (shoppingList, byCategory, stepFor) stays correct for all
 *     generated inputs (Req 3.3, 3.4, 3.6)
 *  C. MCP tools (update_pantry, get_pantry) are registered and call the right repo
 *     functions with the right arguments (Req 3.5, 3.7)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, test, expect, mock, beforeAll } from "bun:test";
import * as fc from "fast-check";

// ── Module stubs (must come before any import that transitively touches them) ──

mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("next/navigation", () => ({ redirect: () => {} }));
mock.module("@/shared/supabase/session", () => ({ requireDb: async () => ({}) }));

// Capture the exact args passed to adjustPantry so we can assert on them.
const adjustPantrySpy = mock(async () => []);
mock.module("@/features/pantry/pantry.repo", () => ({
  adjustPantry: adjustPantrySpy,
  removePantryItem: async () => {},
  loadPantry: async () => [],
  cookMeal: async () => ({}),
  recentMeals: async () => [],
}));
mock.module("@/features/pantry/meals.repo", () => ({ afterCooking: async () => ({}) }));
mock.module("@/features/mode/mode.repo", () => ({
  withMode: async (_db: unknown, _d: unknown, v: unknown) => v,
}));
mock.module("@/shared/mcp/kit", () => ({
  dbFrom: () => ({}),
  ok: (v: unknown) => ({ content: [{ type: "text", text: JSON.stringify(v) }] }),
  toolError: (msg: string) => ({ isError: true, content: [{ type: "text", text: msg }] }),
}));

// ── Imports ──

import { McpServer } from "@modelcontextprotocol/server";
import { saveItemAction } from "./pantry.actions";
import { registerPantryTools } from "./pantry.tools";
import {
  shoppingList,
  byCategory,
  stepFor,
  normalizeUnit,
  type PantryItem,
} from "./pantry";

// ── Arbitraries (smart generators scoped to valid input space) ──

/** A single printable word, trimmed, non-empty. */
const nameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/** Valid unit strings — covers aliases and realistic custom units.
 *
 * NOTE: UNIT_ALIASES uses a plain object literal, so prototype-inherited
 * property names (e.g. "constructor", "toString") would cause normalizeUnit
 * to return a non-string. Those are not realistic unit strings and are
 * intentionally excluded here so this file stays focused on *preservation*
 * of the pantry edit/delete fix rather than discovering a separate
 * normalizeUnit robustness issue.
 */
const RESERVED_JS_NAMES = new Set([
  "constructor", "prototype", "__proto__", "hasOwnProperty",
  "toString", "valueOf", "toLocaleString", "isPrototypeOf",
  "propertyIsEnumerable", "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__",
]);

const unitArb = fc.oneof(
  fc.constantFrom("kg", "g", "l", "ml", "pieces", "grams", "tins", "cups", "packs", "bags"),
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z0-9]*$/.test(s) && !RESERVED_JS_NAMES.has(s)),
);

/** Non-negative finite quantity. */
const quantityArb = fc.float({ min: 0, max: 10_000, noNaN: true }).filter(Number.isFinite);

/** Valid category. */
const categoryArb = fc.constantFrom(
  "grains", "protein", "vegetables", "fruit", "spices", "oils", "drinks", "snacks", "other",
);

/** A full PantryItem. */
const pantryItemArb: fc.Arbitrary<PantryItem> = fc.record({
  name: nameArb,
  quantity: quantityArb,
  unit: unitArb,
  category: categoryArb,
  lowAt: fc.oneof(fc.constant(null), quantityArb),
});

/** Multiple pantry items with unique names (needed for byCategory / shoppingList). */
const pantryItemsArb = fc
  .array(pantryItemArb, { minLength: 0, maxLength: 20 })
  .map((items) => {
    const seen = new Set<string>();
    return items.filter((i) => !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase()));
  });

// ── Helper: build a FormData for the edit form (no unit field — unfixed) ──

function editFormData(name: string, quantity: number, lowAt: number | null, category: string): FormData {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("quantity", String(quantity));
  if (lowAt !== null) fd.set("low_at", String(lowAt));
  fd.set("category", category);
  // Intentionally NO "unit" key — this is the unfixed edit form
  return fd;
}

// ── Helper: collect tool names registered on an McpServer ──

function collectToolNames(server: McpServer): string[] {
  const names: string[] = [];
  const original = server.registerTool.bind(server);
  (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (
    name: unknown,
    ...rest: unknown[]
  ) => {
    names.push(name as string);
    return (original as (...a: unknown[]) => unknown)(name, ...rest);
  };
  return names;
}

// ── Section A: saveItemAction field preservation ──

describe("Preservation — Section A: saveItemAction passes correct non-unit fields", () => {
  /**
   * Property 3A — Quantity reach
   *
   * For any item and a new quantity value, when the edit form is submitted
   * without a unit field (unfixed form), adjustPantry is called with the
   * correct `set` value.
   *
   * Validates: Requirements 3.1, 3.2
   */
  test("Property 3A: edited quantity always reaches adjustPantry as 'set'", async () => {
    await fc.assert(
      fc.asyncProperty(
        pantryItemArb,
        quantityArb,
        async (item, newQty) => {
          adjustPantrySpy.mockClear();

          // Stub requireDb to return a mock Db that pretends the item exists
          // (avoids the "new items need a unit" guard in adjustPantry).
          const stubDb = {
            from: () => ({
              select: () => ({ data: [{ name: item.name }], error: null }),
              delete: () => ({ ilike: () => ({ error: null }) }),
              rpc: () => ({ data: [], error: null }),
            }),
          };
          mock.module("@/shared/supabase/session", () => ({
            requireDb: async () => stubDb,
          }));

          const fd = editFormData(item.name, newQty, item.lowAt, item.category);
          await saveItemAction(null, fd);

          expect(adjustPantrySpy).toHaveBeenCalledTimes(1);
          const [, changes] = adjustPantrySpy.mock.calls[0] as unknown as [unknown, Array<{ set?: number }>];
          // The quantity we passed must be forwarded as `set`
          const change = changes[0];
          expect(change.set).toBe(newQty);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property 3B — Category reach
   *
   * For any item, when the edit form is submitted with a different category,
   * adjustPantry receives that category.
   *
   * Validates: Requirement 3.2
   */
  test("Property 3B: edited category always reaches adjustPantry", async () => {
    await fc.assert(
      fc.asyncProperty(
        pantryItemArb,
        categoryArb,
        async (item, newCategory) => {
          adjustPantrySpy.mockClear();

          const stubDb = {
            from: () => ({
              select: () => ({ data: [{ name: item.name }], error: null }),
              delete: () => ({ ilike: () => ({ error: null }) }),
              rpc: () => ({ data: [], error: null }),
            }),
          };
          mock.module("@/shared/supabase/session", () => ({
            requireDb: async () => stubDb,
          }));

          const fd = editFormData(item.name, item.quantity, item.lowAt, newCategory);
          await saveItemAction(null, fd);

          expect(adjustPantrySpy).toHaveBeenCalledTimes(1);
          const [, changes] = adjustPantrySpy.mock.calls[0] as unknown as [unknown, Array<{ category?: string }>];
          expect(changes[0].category).toBe(newCategory);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property 3C — No unit sent means no unit forwarded
   *
   * When no unit key is in the form (unfixed edit form), adjustPantry is NOT
   * called with a unit key. The existing unit in the DB is therefore preserved
   * by the repo — this is the current correct behavior.
   *
   * Validates: Requirement 3.1 (unit unchanged when not edited)
   */
  test("Property 3C: no unit in form → adjustPantry receives no unit key (unit preserved)", async () => {
    await fc.assert(
      fc.asyncProperty(pantryItemArb, async (item) => {
        adjustPantrySpy.mockClear();

        const stubDb = {
          from: () => ({
            select: () => ({ data: [{ name: item.name }], error: null }),
            delete: () => ({ ilike: () => ({ error: null }) }),
            rpc: () => ({ data: [], error: null }),
          }),
        };
        mock.module("@/shared/supabase/session", () => ({
          requireDb: async () => stubDb,
        }));

        const fd = editFormData(item.name, item.quantity, item.lowAt, item.category);
        await saveItemAction(null, fd);

        expect(adjustPantrySpy).toHaveBeenCalledTimes(1);
        const [, changes] = adjustPantrySpy.mock.calls[0] as unknown as [unknown, Array<Record<string, unknown>>];
        // unit should be absent from the change — preserving whatever is in the DB
        expect("unit" in changes[0]).toBe(false);
      }),
      { numRuns: 30 },
    );
  });
});

// ── Section B: Pure pantry logic preservation ──

describe("Preservation — Section B: pure pantry logic (shoppingList, byCategory, stepFor)", () => {
  /**
   * Property 3D — shoppingList includes every out-of-stock item
   *
   * For any list of items, every item with quantity ≤ 0 appears in the
   * shopping list with reason "out".
   *
   * Validates: Requirement 3.6 (low-stock indicator / shopping list logic preserved)
   */
  test("Property 3D: every out-of-stock item appears in the shopping list as 'out'", () => {
    fc.assert(
      fc.property(pantryItemsArb, (items) => {
        const list = shoppingList(items);
        const outNames = new Set(list.filter((e) => e.reason === "out").map((e) => e.name));
        for (const item of items) {
          if (item.quantity <= 0) {
            expect(outNames.has(item.name)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3E — shoppingList includes every low-stock item
   *
   * For any list of items, every item with 0 < quantity ≤ lowAt appears in
   * the shopping list with reason "low".
   *
   * Validates: Requirement 3.6
   */
  test("Property 3E: every low-stock item (0 < qty ≤ lowAt) appears as 'low'", () => {
    fc.assert(
      fc.property(pantryItemsArb, (items) => {
        const list = shoppingList(items);
        const lowNames = new Set(list.filter((e) => e.reason === "low").map((e) => e.name));
        for (const item of items) {
          if (item.lowAt !== null && item.quantity > 0 && item.quantity <= item.lowAt) {
            expect(lowNames.has(item.name)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3F — shoppingList never includes well-stocked items
   *
   * Items with quantity > lowAt (or no lowAt, and quantity > 0) are never listed.
   *
   * Validates: Requirement 3.6
   */
  test("Property 3F: well-stocked items never appear in the shopping list", () => {
    fc.assert(
      fc.property(pantryItemsArb, (items) => {
        const list = shoppingList(items);
        const listedNames = new Set(list.map((e) => e.name));
        for (const item of items) {
          const isWellStocked =
            item.quantity > 0 &&
            (item.lowAt === null || item.quantity > item.lowAt);
          if (isWellStocked) {
            expect(listedNames.has(item.name)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3G — shoppingList ordering: "out" before "low"
   *
   * All "out" entries appear before any "low" entry in the result.
   *
   * Validates: Requirement 3.6
   */
  test("Property 3G: out-of-stock entries always precede low-stock entries", () => {
    fc.assert(
      fc.property(pantryItemsArb, (items) => {
        const list = shoppingList(items);
        let seenLow = false;
        for (const entry of list) {
          if (entry.reason === "low") seenLow = true;
          if (seenLow && entry.reason === "out") {
            // An "out" entry after a "low" entry — ordering violated
            throw new Error(`ordering violated: "out" entry after "low" — entry: ${JSON.stringify(entry)}`);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3H — byCategory covers all items exactly once
   *
   * For any item list, every item appears in exactly one category group and
   * no item is duplicated or dropped.
   *
   * Validates: Requirement 3.7 (get_pantry grouping logic preserved)
   */
  test("Property 3H: byCategory covers every item exactly once", () => {
    fc.assert(
      fc.property(pantryItemsArb, (items) => {
        const groups = byCategory(items);
        const flattened = groups.flatMap(([, xs]) => xs.map((x) => x.name));
        expect(flattened.sort()).toEqual(items.map((i) => i.name).sort());
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3I — stepFor is stable for all normalised units
   *
   * For any unit string, normalizeUnit followed by stepFor produces the same
   * result as calling stepFor directly — stepFor already normalises internally,
   * so double-normalising is idempotent.
   *
   * Validates: Requirement 3.4 (step buttons unaffected)
   */
  test("Property 3I: stepFor is idempotent under normalizeUnit", () => {
    fc.assert(
      fc.property(unitArb, (unit) => {
        const stepDirect = stepFor(unit);
        const stepNormalized = stepFor(normalizeUnit(unit));
        expect(stepDirect).toBe(stepNormalized);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Property 3J — stepFor returns positive values for all units
   *
   * Validates: Requirement 3.4
   */
  test("Property 3J: stepFor always returns a positive number", () => {
    fc.assert(
      fc.property(unitArb, (unit) => {
        expect(stepFor(unit)).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});

// ── Section C: MCP tool registration preservation ──

describe("Preservation — Section C: MCP tools remain registered and correct", () => {
  /**
   * Property 3K — update_pantry and get_pantry always registered
   *
   * After registerPantryTools runs, both existing tools must still be in the
   * registry (verifies the fix doesn't accidentally remove anything).
   *
   * Validates: Requirements 3.5, 3.7
   */
  test("Property 3K: update_pantry and get_pantry are registered (unfixed baseline)", () => {
    const server = new McpServer({ name: "test-preservation", version: "1" });
    const names = collectToolNames(server);
    registerPantryTools(server);

    expect(names).toContain("update_pantry");
    expect(names).toContain("get_pantry");
    expect(names).toContain("cook_meal");
  });

  /**
   * Property 3L — update_pantry invokes adjustPantry with the correct delta
   *
   * For any item name and delta, calling the update_pantry tool handler
   * forwards the delta to adjustPantry (the repo) unchanged.
   *
   * Validates: Requirement 3.5
   */
  test("Property 3L: update_pantry forwards delta changes to adjustPantry correctly", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, fc.float({ noNaN: true }), async (itemName, delta) => {
        adjustPantrySpy.mockClear();

        // Re-register to capture the handler
        const captured: { handler?: (args: unknown, ctx: unknown) => Promise<unknown> } = {};
        const server = new McpServer({ name: "test-delta", version: "1" });
        const original = server.registerTool.bind(server);
        (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (
          name: unknown,
          meta: unknown,
          handler: unknown,
        ) => {
          if (name === "update_pantry") captured.handler = handler as (args: unknown, ctx: unknown) => Promise<unknown>;
          return (original as (...a: unknown[]) => unknown)(name, meta, handler);
        };
        registerPantryTools(server);

        if (!captured.handler) throw new Error("update_pantry not registered");

        await captured.handler(
          { changes: [{ name: itemName, delta }] },
          { extra: { userId: "u1" } },
        );

        expect(adjustPantrySpy).toHaveBeenCalledTimes(1);
        const [, changes] = adjustPantrySpy.mock.calls[0] as unknown as [unknown, Array<{ name: string; delta?: number }>];
        const change = changes.find((c) => c.name === itemName.trim());
        expect(change).toBeDefined();
        expect(change!.delta).toBe(delta);
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property 3M — get_pantry invokes loadPantry and returns grouped results
   *
   * Calling the get_pantry handler returns an object with inStock, shoppingList,
   * and recentMeals keys — the shape is preserved for any pantry contents.
   *
   * Validates: Requirement 3.7
   */
  test("Property 3M: get_pantry always returns inStock, shoppingList, and recentMeals", async () => {
    await fc.assert(
      fc.asyncProperty(pantryItemsArb, async (items) => {
        // Override loadPantry stub to return generated items
        mock.module("@/features/pantry/pantry.repo", () => ({
          adjustPantry: adjustPantrySpy,
          removePantryItem: async () => {},
          loadPantry: async () => items,
          cookMeal: async () => ({}),
          recentMeals: async () => [],
        }));

        const captured: { handler?: (args: unknown, ctx: unknown) => Promise<unknown> } = {};
        const server = new McpServer({ name: "test-get", version: "1" });
        const original = server.registerTool.bind(server);
        (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (
          name: unknown,
          meta: unknown,
          handler: unknown,
        ) => {
          if (name === "get_pantry") captured.handler = handler as (args: unknown, ctx: unknown) => Promise<unknown>;
          return (original as (...a: unknown[]) => unknown)(name, meta, handler);
        };
        registerPantryTools(server);

        if (!captured.handler) throw new Error("get_pantry not registered");

        const result = (await captured.handler({ meal_days: 7 }, { extra: { userId: "u1" } })) as {
          content: Array<{ text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text) as {
          inStock?: unknown;
          shoppingList?: unknown;
          recentMeals?: unknown;
        };

        expect(parsed).toHaveProperty("inStock");
        expect(parsed).toHaveProperty("shoppingList");
        expect(parsed).toHaveProperty("recentMeals");

        // In-stock only includes items with quantity > 0
        const stockItems = Object.values(parsed.inStock as Record<string, unknown[]>).flat();
        for (const item of items.filter((i) => i.quantity <= 0)) {
          // Zero-quantity items must not appear in inStock
          const found = (stockItems as string[]).some((s) => (s as string).startsWith(item.name));
          expect(found).toBe(false);
        }
      }),
      { numRuns: 20 },
    );
  });
});
