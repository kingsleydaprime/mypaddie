import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { acceptMeals, deleteRecipe, loadMealPlan, loadRecipes, proposeMealPlan, saveRecipe } from "./meals.repo";
import { currentConfig } from "@/shared/config";
import { dayKey } from "@/shared/time";

const ingredient = z.object({ name: z.string().trim().min(1), quantity: z.number().positive(), unit: z.string().trim() });

function run<A>(name: string, fn: (args: A, ctx: ToolContext, now: Date) => Promise<Record<string, unknown>>) {
  return async (args: A, ctx: ToolContext) => {
    try {
      const db = dbFrom(ctx);
      const now = new Date();
      return ok(await withMode(db, now, await fn(args, ctx, now)));
    } catch (error) {
      return toolError(`${name} failed: ${(error as Error).message}`);
    }
  };
}

export function registerMealTools(server: McpServer) {
  server.registerTool(
    "save_recipe",
    {
      title: "Save recipe",
      description:
        "A dish they make, with ingredients in the pantry's units (so propose_meals can check stock). `slots`: which " +
        "meals it suits, by their meal names (breakfast, lunch, dinner); omit for any. Saving an existing name replaces " +
        "it. Dishes cooked with cook_meal are learned automatically — this is for adding or correcting.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(100),
        ingredients: z.array(ingredient).max(40),
        slots: z.array(z.string().trim().min(1)).optional(),
        minutes: z.number().int().min(1).max(600).optional(),
        notes: z.string().max(1000).optional(),
      }),
    },
    run("save_recipe", async (a: { name: string; ingredients: z.infer<typeof ingredient>[]; slots?: string[]; minutes?: number; notes?: string }, ctx) => ({ ...(await saveRecipe(dbFrom(ctx), a)) })),
  );

  server.registerTool(
    "list_recipes",
    {
      title: "Recipes",
      description: "Their saved recipes with ingredients and which meals each suits.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    run("list_recipes", async (_a: Record<string, never>, ctx) => ({ recipes: await loadRecipes(dbFrom(ctx)) })),
  );

  server.registerTool(
    "delete_recipe",
    {
      title: "Delete recipe",
      description: "Remove a recipe by name. Plans that used it keep the dish's name.",
      inputSchema: z.object({ name: z.string().trim().min(1) }),
      annotations: { destructiveHint: true },
    },
    run("delete_recipe", async (a: { name: string }, ctx) => ({ ...(await deleteRecipe(dbFrom(ctx), a.name)) })),
  );

  server.registerTool(
    "propose_meals",
    {
      title: "Propose meals",
      description:
        "Plan what to eat: a recipe for each open meal slot (their schedule's meals) over the next `days` (default 3, " +
        "from today's meals still ahead). It prefers dishes the pantry can fully make — each pick reserves its " +
        "ingredients for the next — and doesn't repeat a dish within 2 days of eating or planning it. Nothing is " +
        "saved: present it briefly (day, meal, dish, ✓ or what's missing) with the combined shopping list, and ask " +
        "them to accept, swap or drop. To swap, call again with the rejected dishes in `exclude`; `replan` redoes " +
        "slots already planned. Then accept_meals.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(7).optional(),
        start: z.iso.date().optional(),
        exclude: z.array(z.string().trim().min(1)).optional(),
        replan: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    run("propose_meals", async (a: { days?: number; start?: string; exclude?: string[]; replan?: boolean }, ctx, now) => ({ ...(await proposeMealPlan(dbFrom(ctx), now, a)) })),
  );

  server.registerTool(
    "accept_meals",
    {
      title: "Accept meals",
      description:
        "Save the meals they agreed to (from propose_meals, possibly changed — any dish name is fine, a recipe isn't " +
        "required). A slot already planned is replaced; one already cooked is left alone. `remove` clears planned " +
        "slots. Cooking the dish with cook_meal ticks it off.",
      inputSchema: z.object({
        meals: z.array(z.object({ day: z.iso.date(), slot: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), recipe_id: z.uuid().optional() })).max(30),
        remove: z.array(z.object({ day: z.iso.date(), slot: z.string().trim().min(1) })).optional(),
      }),
    },
    run("accept_meals", async (a: { meals: { day: string; slot: string; name: string; recipe_id?: string }[]; remove?: { day: string; slot: string }[] }, ctx, now) => {
      const db = dbFrom(ctx);
      const results = await acceptMeals(db, a.meals.map((m) => ({ day: m.day, slot: m.slot, name: m.name, recipeId: m.recipe_id })), a.remove ?? []);
      return { results, plan: await loadMealPlan(db, dayKey(now, currentConfig().timeZone), 7) };
    }),
  );
}
