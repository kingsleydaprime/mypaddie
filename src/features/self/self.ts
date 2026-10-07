export const SELF_KINDS = ["strength", "weakness", "healing", "pattern", "trigger", "good_habit", "bad_habit", "history"] as const;
export type SelfKind = (typeof SELF_KINDS)[number];

export const SELF_LABEL: Record<SelfKind, string> = {
  strength: "Strengths",
  weakness: "Weak spots",
  healing: "Healing from",
  pattern: "Patterns",
  trigger: "Triggers",
  good_habit: "Good habits",
  bad_habit: "Habits to break",
  history: "History",
};

/** What the AI should keep in mind every chat: the things that change what good advice looks like. */
export const ADVICE_KINDS: readonly SelfKind[] = ["pattern", "trigger", "weakness", "bad_habit", "healing"];
