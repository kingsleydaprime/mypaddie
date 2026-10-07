import { currentConfig } from "./config";

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    // Whole units: budgets here never need kobo or cents.
    f = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0, minimumFractionDigits: 0 });
    formatters.set(currency, f);
  }
  return f;
}

/**
 * ₦150,000 / GH₵1,200 / £85 — in the user's currency. On the server it's
 * read from the request; browser components are handed `currency` by their page.
 */
export const formatMoney = (amount: number, currency: string = currentConfig().currency) => formatterFor(currency).format(amount);

/** "₦", "£", "GH₵" — for input placeholders and labels. */
export function currencySymbol(currency: string = currentConfig().currency): string {
  return formatterFor(currency).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

/** "₦85,000", "85 000", "$1,200" → 85000 / 1200. Anything but digits and a leading minus is dropped. */
export const parseAmount = (raw: string) => Number(raw.replace(/(?!^-)[^\d]/g, ""));
