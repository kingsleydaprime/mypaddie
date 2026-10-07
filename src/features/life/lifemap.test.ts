import { describe, expect, test } from "bun:test";
import { PILLARS } from "@/shared/domain";
import { AREA_INFO, AREAS, areaFacts, lifeMap, stateOf, type LifeInputs } from "./lifemap";

const base = (extra: Partial<LifeInputs> = {}): LifeInputs => ({
  trends: {},
  xpRecent: {},
  xpBefore: {},
  money: { stage: "audit", capsOver: [], billsOverdue: 0, owedOverdue: 0 },
  people: { dueCount: 0, contactsRecent: 0, tracked: 0 },
  fun: { daysSince: null },
  slipsRecent: 0,
  ...extra,
});

describe("areas", () => {
  test("every pillar sits in exactly one area", () => {
    const all = AREAS.flatMap((a) => AREA_INFO[a].pillars);
    expect([...all].sort()).toEqual([...PILLARS].sort());
  });
});

describe("stateOf", () => {
  test("any problem means attention; strengths alone mean good; information alone is okay; nothing is unknown", () => {
    expect(stateOf([{ text: "a", good: true }, { text: "b", good: false }])).toBe("attention");
    expect(stateOf([{ text: "a", good: true }, { text: "b", good: null }])).toBe("good");
    expect(stateOf([{ text: "a", good: null }])).toBe("okay");
    expect(stateOf([])).toBe("unknown");
  });
});

describe("areaFacts", () => {
  test("body: short sleep is a problem even if it's steady", () => {
    const f = areaFacts("body", base({ trends: { sleep: { recent: 5.4, direction: "steady", good: null } } }));
    expect(f).toEqual([{ text: "Sleep 5.4h", good: false }]);
  });
  test("body: no workouts lately", () => {
    expect(areaFacts("body", base({ trends: { exercise: { recent: 0, direction: "down", good: false } } }))).toContainEqual({ text: "No workouts lately", good: false });
  });
  test("mind: low mood and many slips", () => {
    const f = areaFacts("mind", base({ trends: { mood: { recent: 2.2, direction: "down", good: false } }, slipsRecent: 6 }));
    expect(f.map((x) => x.good)).toEqual([false, false]);
  });
  test("money: deficit, caps and overdue bills each named", () => {
    const f = areaFacts("money", base({ money: { stage: "deficit", capsOver: ["Food"], billsOverdue: 1, owedOverdue: 2 } }));
    expect(f.map((x) => x.text)).toEqual([
      "In deficit: needs cost more than comes in",
      "Over your cap: Food",
      "1 bill overdue",
      "2 repayments you owe overdue",
    ]);
  });
  test("people: nothing tracked, nothing said", () => {
    expect(areaFacts("people", base())).toEqual([]);
  });
  test("people: three due is a problem; catch-ups are a strength", () => {
    const f = areaFacts("people", base({ people: { dueCount: 3, contactsRecent: 2, tracked: 8 } }));
    expect(f).toEqual([{ text: "3 people due a check-in", good: false }, { text: "2 catch-ups in 2 weeks", good: true }]);
  });
  test("faith: judged by its XP — quiet for two weeks after being active is a problem", () => {
    expect(areaFacts("faith", base({ xpRecent: { spiritual: 0 }, xpBefore: { spiritual: 40 } }))).toEqual([{ text: "No XP here in 2 weeks", good: false }]);
    expect(areaFacts("faith", base({ xpRecent: { spiritual: 60 }, xpBefore: { spiritual: 40 } }))).toEqual([{ text: "60 XP in 2 weeks, up on before", good: true }]);
    expect(areaFacts("faith", base())).toEqual([]);
  });
  test("fun: two weeks without is a problem, within a week is a strength", () => {
    expect(areaFacts("fun", base({ fun: { daysSince: 15 } }))[0]).toEqual({ text: "15 days without fun", good: false });
    expect(areaFacts("fun", base({ fun: { daysSince: 3 } }))[0]).toEqual({ text: "Fun 3 days ago", good: true });
  });
});

describe("lifeMap", () => {
  test("seven areas, and one focus: the area with the most problems", () => {
    const m = lifeMap(base({
      money: { stage: "deficit", capsOver: ["Food"], billsOverdue: 0, owedOverdue: 0 },
      fun: { daysSince: 20 },
    }));
    expect(m.areas).toHaveLength(7);
    expect(m.focus).toEqual({ area: "money", label: "Money", why: ["In deficit: needs cost more than comes in", "Over your cap: Food"] });
  });
  test("nothing wrong: no focus", () => {
    expect(lifeMap(base({ money: { stage: "surplus", capsOver: [], billsOverdue: 0, owedOverdue: 0 } })).focus).toBeNull();
  });
});
