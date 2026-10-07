/**
 * One value per line, most important first: "Family — they come before work".
 * The why can follow a dash, en/em dash or colon. Blank lines and repeats are dropped.
 */
export function parseValues(text: string): { value: string; why: string | null }[] {
  const seen = new Set<string>();
  const out: { value: string; why: string | null }[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+[.)])?\s*(.*?)\s*(?:\s[-–—]\s|:\s|[–—])\s*(.*)$/.exec(line);
    const value = (m ? m[1]! : line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")).trim().slice(0, 120);
    const why = (m ? m[2]!.trim() : "").slice(0, 500) || null;
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push({ value, why });
  }
  return out;
}

/** The textarea's starting text: the same format parseValues reads. */
export function valuesText(values: readonly { value: string; why: string | null }[]): string {
  return values.map((v) => (v.why ? `${v.value} — ${v.why}` : v.value)).join("\n");
}
