import { currentConfig } from "./config";

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * ₦150,000 / GH₵1,200.50 / £85.25 — in the user's currency.
 * Whole numbers keep no trailing decimals; numbers with cents/kobo show 2 decimal places.
 */
export function formatMoney(amount: number, currency: string = currentConfig().currency): string {
  const hasDecimals = !Number.isInteger(amount);
  return formatterFor(currency, hasDecimals ? 2 : 0).format(amount);
}

/** "₦", "£", "GH₵" — for input placeholders and labels. */
export function currencySymbol(currency: string = currentConfig().currency): string {
  return formatterFor(currency, 0).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

/**
 * "₦85,000", "85 000", "$1,200.50", "29164.73" → 85000 / 1200.5 / 29164.73.
 * Drops thousands separators (commas, spaces), currency symbols; preserves leading minus and decimal point.
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").replace(/(?!^-)[^\d.]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
