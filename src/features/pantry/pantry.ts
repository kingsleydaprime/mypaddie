/** Spellings people use → one stored unit. Unknown units are kept, lowercased. */
const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gs: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  piece: "pieces", pieces: "pieces", pc: "pieces", pcs: "pieces", "": "pieces",
  tin: "tins", tins: "tins", can: "tins", cans: "tins",
  cup: "cups", cups: "cups", derica: "cups", dericas: "cups",
  pack: "packs", packs: "packs", packet: "packs", packets: "packs", sachet: "packs", sachets: "packs",
  bag: "bags", bags: "bags",
  bottle: "bottles", bottles: "bottles",
  tuber: "tubers", tubers: "tubers",
  bunch: "bunches", bunches: "bunches",
};

export function normalizeUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  return UNIT_ALIASES[u] ?? u;
}

export interface PantryItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  lowAt: number | null;
}

export interface ShoppingEntry {
  name: string;
  quantity: number;
  unit: string;
  reason: "out" | "low";
}

/** Out of stock first, then running low; alphabetical within each. */
export function shoppingList(items: readonly PantryItem[]): ShoppingEntry[] {
  return items
    .flatMap((i): ShoppingEntry[] => {
      if (i.quantity <= 0) return [{ name: i.name, quantity: i.quantity, unit: i.unit, reason: "out" }];
      if (i.lowAt !== null && i.quantity <= i.lowAt) return [{ name: i.name, quantity: i.quantity, unit: i.unit, reason: "low" }];
      return [];
    })
    .sort((a, b) => (a.reason === b.reason ? a.name.localeCompare(b.name) : a.reason === "out" ? -1 : 1));
}

/** Items grouped by category, categories and items alphabetical. */
export function byCategory(items: readonly PantryItem[]): [string, PantryItem[]][] {
  const groups = new Map<string, PantryItem[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, xs]) => [c, [...xs].sort((a, b) => a.name.localeCompare(b.name))]);
}
