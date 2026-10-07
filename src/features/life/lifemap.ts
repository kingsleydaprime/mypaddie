import type { Pillar } from "@/shared/domain";
import { formatMoney } from "@/shared/format";

/**
 * The life map: every area of life on one page, each judged from data that's
 * already logged — no new questions. Pure; the repo gathers the inputs.
 */

export const AREAS = ["body", "mind", "money", "people", "faith", "work", "fun"] as const;
export type Area = (typeof AREAS)[number];

/** Every pillar sits in exactly one area. */
export const AREA_INFO: Record<Area, { label: string; pillars: Pillar[] }> = {
  body: { label: "Body", pillars: ["physical"] },
  mind: { label: "Mind", pillars: ["mental", "emotional"] },
  money: { label: "Money", pillars: ["financial"] },
  people: { label: "People", pillars: ["social", "relationships"] },
  faith: { label: "Faith", pillars: ["spiritual"] },
  work: { label: "Work & school", pillars: ["skills", "academic", "character"] },
  fun: { label: "Fun", pillars: ["creativity"] },
};

export type AreaState = "good" | "okay" | "attention" | "unknown";
export interface Fact {
  text: string;
  /** true = a strength, false = a problem, null = just information. */
  good: boolean | null;
}

export interface Trend {
  recent: number | null;
  direction: "up" | "down" | "steady" | "not_enough";
  good: boolean | null;
}

export interface LifeInputs {
  trends: Partial<Record<"sleep" | "energy" | "mood" | "screen_time" | "exercise" | "learning" | "spending" | "word_kept", Trend>>;
  /** XP per pillar in the last 14 days, and per 14 days on average over the 28 before. */
  xpRecent: Partial<Record<Pillar, number>>;
  xpBefore: Partial<Record<Pillar, number>>;
  /** `currency`: ISO code money facts are shown in. */
  money: { stage: "audit" | "deficit" | "surplus"; capsOver: string[]; billsOverdue: number; owedOverdue: number; currency: string };
  people: { dueCount: number; contactsRecent: number; tracked: number };
  fun: { daysSince: number | null };
  slipsRecent: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** XP in an area's pillars: moving, stalled or quiet compared with before. */
function xpFact(area: Area, inp: LifeInputs): Fact | null {
  const pillars = AREA_INFO[area].pillars;
  const recent = pillars.reduce((s, p) => s + (inp.xpRecent[p] ?? 0), 0);
  const before = pillars.reduce((s, p) => s + (inp.xpBefore[p] ?? 0), 0);
  if (recent === 0 && before === 0) return null;
  if (recent <= 0) return { text: "No XP here in 2 weeks", good: false };
  if (before > 0 && recent >= before * 1.2) return { text: `${recent} XP in 2 weeks, up on before`, good: true };
  if (before > 0 && recent <= before * 0.5) return { text: `${recent} XP in 2 weeks, half what it was`, good: false };
  return { text: `${recent} XP in 2 weeks`, good: null };
}

/** `show` formats the number (money gets its currency); default: one decimal. */
function trendFact(t: Trend | undefined, label: string, unit: string, show: (n: number) => string = (n) => String(r1(n))): Fact | null {
  if (!t || t.recent === null) return null;
  const how = t.direction === "not_enough" || t.direction === "steady" ? "" : t.good ? ", improving" : ", slipping";
  return { text: `${label} ${show(t.recent)}${unit}${how}`, good: t.direction === "steady" || t.direction === "not_enough" ? null : t.good };
}

/** The facts for each area. Thresholds are deliberately few and plain. */
export function areaFacts(area: Area, inp: LifeInputs): Fact[] {
  const t = inp.trends;
  const facts: (Fact | null)[] = [];
  switch (area) {
    case "body": {
      const sleep = trendFact(t.sleep, "Sleep", "h");
      if (sleep && t.sleep!.recent! < 6) sleep.good = false;
      facts.push(sleep, trendFact(t.energy, "Energy", "/5"));
      if (t.exercise && t.exercise.recent !== null) {
        facts.push(t.exercise.recent === 0 ? { text: "No workouts lately", good: false } : trendFact(t.exercise, "Workouts", " a week"));
      }
      break;
    }
    case "mind": {
      const mood = trendFact(t.mood, "Mood", "/5");
      if (mood && t.mood!.recent! <= 2.5) mood.good = false;
      facts.push(mood, trendFact(t.screen_time, "Screen time", "h a day"));
      if (inp.slipsRecent >= 5) facts.push({ text: `${inp.slipsRecent} slips in 2 weeks`, good: false });
      break;
    }
    case "money": {
      const m = inp.money;
      if (m.stage === "deficit") facts.push({ text: "In deficit: needs cost more than comes in", good: false });
      else if (m.stage === "surplus") facts.push({ text: "Income covers needs", good: true });
      else facts.push({ text: "Still in the first month's audit", good: null });
      if (m.capsOver.length) facts.push({ text: `Over your cap: ${m.capsOver.join(", ")}`, good: false });
      if (m.billsOverdue) facts.push({ text: `${m.billsOverdue} bill${m.billsOverdue === 1 ? "" : "s"} overdue`, good: false });
      if (m.owedOverdue) facts.push({ text: `${m.owedOverdue} repayment${m.owedOverdue === 1 ? "" : "s"} you owe overdue`, good: false });
      facts.push(trendFact(t.spending, "Spending", " a week", (n) => formatMoney(Math.round(n), m.currency)));
      break;
    }
    case "people": {
      const p = inp.people;
      if (p.tracked > 0) {
        if (p.dueCount >= 3) facts.push({ text: `${p.dueCount} people due a check-in`, good: false });
        else if (p.dueCount > 0) facts.push({ text: `${p.dueCount} ${p.dueCount === 1 ? "person" : "people"} due a check-in`, good: null });
        facts.push(p.contactsRecent > 0 ? { text: `${p.contactsRecent} catch-up${p.contactsRecent === 1 ? "" : "s"} in 2 weeks`, good: true } : { text: "No catch-ups logged in 2 weeks", good: false });
      }
      break;
    }
    case "faith":
      break;
    case "work":
      facts.push(trendFact(t.learning, "Study", "h a week"), trendFact(t.word_kept, "Word kept", "%"));
      break;
    case "fun": {
      const d = inp.fun.daysSince;
      if (d !== null) facts.push(d >= 14 ? { text: `${d} days without fun`, good: false } : d <= 7 ? { text: d === 0 ? "Had fun today" : `Fun ${d} day${d === 1 ? "" : "s"} ago`, good: true } : { text: `${d} days since fun`, good: null });
      break;
    }
  }
  facts.push(xpFact(area, inp));
  return facts.filter((f): f is Fact => f !== null);
}

/** Any problem → attention; strengths and no problems → good; only information → okay; nothing → unknown. */
export function stateOf(facts: readonly Fact[]): AreaState {
  if (facts.length === 0) return "unknown";
  if (facts.some((f) => f.good === false)) return "attention";
  if (facts.some((f) => f.good === true)) return "good";
  return "okay";
}

export function lifeMap(inp: LifeInputs) {
  const areas = AREAS.map((area) => {
    const facts = areaFacts(area, inp);
    const xp14 = AREA_INFO[area].pillars.reduce((s, p) => s + (inp.xpRecent[p] ?? 0), 0);
    return { area, label: AREA_INFO[area].label, state: stateOf(facts), facts, pillars: AREA_INFO[area].pillars, xp14 };
  });
  // One area to give attention this week (the one with most problems, then least XP) — not a list of everything wrong.
  const focus =
    [...areas]
      .filter((a) => a.state === "attention")
      .sort((a, b) => b.facts.filter((f) => f.good === false).length - a.facts.filter((f) => f.good === false).length || a.xp14 - b.xp14)[0] ?? null;
  return { areas, focus: focus ? { area: focus.area, label: focus.label, why: focus.facts.filter((f) => f.good === false).map((f) => f.text) } : null };
}
