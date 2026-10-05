import { describe, expect, test } from "bun:test";
import { InvalidWeightsError, splitXp, validateWeights, type PillarWeight } from "./split";

const exercise: PillarWeight[] = [
  { pillar: "physical", weight: 50 },
  { pillar: "mental", weight: 30 },
  { pillar: "emotional", weight: 20 },
];

const sum = (parts: { amount: number }[]) => parts.reduce((s, p) => s + p.amount, 0);

describe("validateWeights", () => {
  test("accepts the blueprint's exercise example", () => {
    expect(() => validateWeights(exercise)).not.toThrow();
  });
  test("accepts a single pillar at 100", () => {
    expect(() => validateWeights([{ pillar: "spiritual", weight: 100 }])).not.toThrow();
  });
  test.each([
    ["no weights", []],
    ["sum under 100", [{ pillar: "physical", weight: 99 }]],
    [
      "sum over 100",
      [
        { pillar: "physical", weight: 60 },
        { pillar: "mental", weight: 41 },
      ],
    ],
    [
      "duplicate pillar",
      [
        { pillar: "physical", weight: 50 },
        { pillar: "physical", weight: 50 },
      ],
    ],
    [
      "zero weight",
      [
        { pillar: "physical", weight: 100 },
        { pillar: "mental", weight: 0 },
      ],
    ],
    [
      "negative weight",
      [
        { pillar: "physical", weight: 110 },
        { pillar: "mental", weight: -10 },
      ],
    ],
    [
      "fractional weight",
      [
        { pillar: "physical", weight: 50.5 },
        { pillar: "mental", weight: 49.5 },
      ],
    ],
    ["unknown pillar", [{ pillar: "vibes", weight: 100 }]],
  ] as [string, PillarWeight[]][])("rejects %s", (_name, weights) => {
    expect(() => validateWeights(weights)).toThrow(InvalidWeightsError);
  });
});

describe("splitXp", () => {
  test("100 XP exercise splits 50/30/20, not 100 per pillar", () => {
    expect(splitXp(100, exercise)).toEqual([
      { pillar: "physical", amount: 50 },
      { pillar: "mental", amount: 30 },
      { pillar: "emotional", amount: 20 },
    ]);
  });

  test("uneven amounts still sum exactly to the total", () => {
    for (const amount of [1, 2, 3, 7, 10, 11, 33, 99, 101, 12345]) {
      expect(sum(splitXp(amount, exercise))).toBe(amount);
    }
  });

  test("three equal-ish thirds: 10 XP over 34/33/33 gives the extra point to the biggest weight", () => {
    const thirds: PillarWeight[] = [
      { pillar: "skills", weight: 34 },
      { pillar: "mental", weight: 33 },
      { pillar: "creativity", weight: 33 },
    ];
    expect(splitXp(10, thirds)).toEqual([
      { pillar: "skills", amount: 4 },
      { pillar: "mental", amount: 3 },
      { pillar: "creativity", amount: 3 },
    ]);
  });

  test("ties on weight are broken by pillar order, so the result is deterministic", () => {
    const halves: PillarWeight[] = [
      { pillar: "social", weight: 50 },
      { pillar: "spiritual", weight: 50 },
    ];
    // spiritual comes before social in PILLARS, so it gets the odd point.
    expect(splitXp(1, halves)).toEqual([{ pillar: "spiritual", amount: 1 }]);
  });

  test("pillars whose share rounds to zero are left out", () => {
    expect(splitXp(1, exercise)).toEqual([{ pillar: "physical", amount: 1 }]);
  });

  test("zero XP splits into nothing", () => {
    expect(splitXp(0, exercise)).toEqual([]);
  });

  test("negative amounts (deductions) split with the same proportions", () => {
    const parts = splitXp(-11, exercise);
    expect(sum(parts)).toBe(-11);
    expect(parts.every((p) => p.amount < 0)).toBe(true);
    expect(parts).toEqual([
      { pillar: "physical", amount: -6 },
      { pillar: "mental", amount: -3 },
      { pillar: "emotional", amount: -2 },
    ]);
  });

  test("rejects fractional XP", () => {
    expect(() => splitXp(2.5, exercise)).toThrow(RangeError);
  });

  test("rejects invalid weights before splitting", () => {
    expect(() => splitXp(10, [{ pillar: "physical", weight: 90 }])).toThrow(InvalidWeightsError);
  });
});
