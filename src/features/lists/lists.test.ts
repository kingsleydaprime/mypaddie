import { describe, expect, test } from "bun:test";
import { validateWeights } from "@/features/xp/split";
import { BUCKET_WEIGHTS, isBucketList, parseItems, progressOf } from "./lists";

describe("lists", () => {
  test("progress: done / total, whole percent, empty = 0", () => {
    expect(progressOf([{ done: true }, { done: false }, { done: false }])).toEqual({ done: 1, total: 3, percent: 33 });
    expect(progressOf([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(progressOf([{ done: true }, { done: true }])).toMatchObject({ percent: 100 });
  });
  test("the bucket list, however it's spelled", () => {
    expect(isBucketList("Bucket list")).toBe(true);
    expect(isBucketList(" bucketlist ")).toBe(true);
    expect(isBucketList("Bucket-List")).toBe(true);
    expect(isBucketList("Gift ideas")).toBe(false);
    expect(() => validateWeights(BUCKET_WEIGHTS)).not.toThrow();
  });
  test("pasted lines become items", () => {
    expect(parseItems("- See the pyramids\n2. Learn to swim\n\n[ ] Run a 10k\n• Visit Zanzibar")).toEqual(["See the pyramids", "Learn to swim", "Run a 10k", "Visit Zanzibar"]);
  });
});
