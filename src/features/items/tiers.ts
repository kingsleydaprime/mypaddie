import type { Tier } from "@/shared/domain";

/** How Paddie treats each tier — the blueprint's table, in one line each. */
export const TIER_INFO: Record<Tier, { label: string; plural: string; blurb: string }> = {
  need: { label: "Need", plural: "Needs", blurb: "Non-negotiable. Funded first, nudged until done." },
  want: { label: "Want", plural: "Wants", blurb: "Goes through the don't-buy-this check." },
  goal: { label: "Goal", plural: "Goals", blurb: "A target and a deadline, broken into daily tasks." },
  wish: { label: "Wish", plural: "Wishes", blurb: "Side quests, zero guilt. Bonus XP if it happens." },
  dream: { label: "Dream", plural: "Dreams", blurb: "Big and scary. Broken into goals, kept in view." },
};
