import type { PillarWeight } from "@/features/xp/split";

export interface ListProgress {
  done: number;
  total: number;
  /** Whole percent; 0 for an empty list. */
  percent: number;
}

export function progressOf(items: readonly { done: boolean }[]): ListProgress {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, percent: items.length ? Math.round((100 * done) / items.length) : 0 };
}

/** "Bucket list" spelled however — the one list ticking off pays a wish-sized bonus. */
export const isBucketList = (title: string) => /^bucket\s*-?\s*list$/i.test(title.trim());

/** Ticking off a bucket-list item is a wish come true: +50, the same as a wish happening. */
export const BUCKET_XP = 50;
export const BUCKET_WEIGHTS: PillarWeight[] = [{ pillar: "emotional", weight: 50 }, { pillar: "creativity", weight: 50 }];

/** Pasted lines → items: bullets, numbering and blank lines dropped. */
export function parseItems(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim().replace(/^([-*•]|\[[ x]?\]|\d{1,3}[.)])\s*/i, "").trim())
    .filter((l) => l.length > 0 && l.length <= 300);
}
