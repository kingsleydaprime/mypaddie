import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { byCategory, shoppingList } from "./pantry";
import { adjustPantry, cookMeal, loadPantry, recentMeals } from "./pantry.repo";

const quantity = z.number().nonnegative();

export function registerPantryTools(server: McpServer) {
  server.registerTool(
    "update_pantry",
    {
      title: "Update pantry",
      description:
        "Change food stock — a shopping trip, using something up, or a stock-take. delta adds (+) or uses (−); set " +
        "is the exact amount now. Each item keeps one unit (kg, g, l, ml, pieces, tins, cups, packs, bags…); " +
        "convert to it if the user uses another (500g of something stored in kg → 0.5). New items need a unit and a " +
        "category (grains, protein, vegetables, fruit, spices, oils, drinks, snacks, other). Set low_at for things " +
        "the user never wants to run out of. When the user logs a food purchase, offer to add it here too.",
      inputSchema: z.object({
        changes: z
          .array(
            z
              .object({
                name: z.string().trim().min(1),
                unit: z.string().trim().optional(),
                delta: z.number().optional(),
                set: quantity.optional(),
                category: z.string().trim().min(1).optional(),
                low_at: quantity.nullable().optional(),
              })
              // Either an amount change (delta) or a stock-take (set), never both. Neither is
              // fine when only the category or low level is changing.
              .refine((c) => c.delta === undefined || c.set === undefined, "give delta or set, not both"),
          )
          .min(1),
      }),
    },
    async (
      { changes }: { changes: { name: string; unit?: string; delta?: number; set?: number; category?: string; low_at?: number | null }[] },
      ctx: ToolContext,
    ) => {
      try {
        const db = dbFrom(ctx);
        const updated = await adjustPantry(db, changes.map((c) => ({ ...c, lowAt: c.low_at })));
        const list = shoppingList(await loadPantry(db));
        return ok(await withMode(db, new Date(), { updated, shoppingList: list }));
      } catch (error) {
        return toolError(`update_pantry failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_pantry",
    {
      title: "Get pantry",
      description:
        "What food is in stock (by category), the shopping list (out of stock / running low), and recent meals. " +
        "Use it to answer 'what can I cook?': suggest 2–3 realistic meals from what's actually there — say what's " +
        "missing for each — and favour things not eaten in the last few days.",
      inputSchema: z.object({ meal_days: z.number().int().min(0).max(30).default(7).describe("How many days of meal history") }),
      annotations: { readOnlyHint: true },
    },
    async ({ meal_days }: { meal_days: number }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const items = await loadPantry(db);
        return ok(
          await withMode(db, now, {
            inStock: Object.fromEntries(byCategory(items.filter((i) => i.quantity > 0)).map(([c, xs]) => [c, xs.map((x) => `${x.name}: ${x.quantity} ${x.unit}`)])),
            shoppingList: shoppingList(items),
            recentMeals: (await recentMeals(db, meal_days, now)).map((m) => ({ name: m.name, at: m.at })),
          }),
        );
      } catch (error) {
        return toolError(`get_pantry failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "cook_meal",
    {
      title: "Cook meal",
      description:
        "Record a meal the user cooked and use up its ingredients from the pantry (use the pantry's units). Ingredients " +
        "the user didn't have logged come back as `missing` — that's fine; offer to add them to the pantry next time.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        ingredients: z.array(z.object({ name: z.string().trim().min(1), quantity, unit: z.string().trim() })).default([]),
        notes: z.string().optional(),
        at: z.iso.datetime({ offset: true }).optional(),
      }),
    },
    async (args: { name: string; ingredients: { name: string; quantity: number; unit: string }[]; notes?: string; at?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const cooked = await cookMeal(db, args);
        const list = shoppingList(await loadPantry(db));
        return ok(await withMode(db, new Date(), { ...cooked, shoppingList: list }));
      } catch (error) {
        return toolError(`cook_meal failed: ${(error as Error).message}`);
      }
    },
  );
}
