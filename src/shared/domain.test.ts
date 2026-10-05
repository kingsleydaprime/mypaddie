import { expect, test } from "bun:test";
import { PILLARS, TIERS } from "./domain";
import { Constants } from "./supabase/database.types";

// The TypeScript lists and the Postgres enums must match exactly, in order:
// order breaks ties when splitting XP. Regenerate types after any enum change.
test("PILLARS mirrors the pillar enum", () => {
  expect([...PILLARS]).toEqual([...Constants.public.Enums.pillar]);
  expect(PILLARS).toHaveLength(11);
});

test("TIERS mirrors the tier enum", () => {
  expect([...TIERS]).toEqual([...Constants.public.Enums.tier]);
});
