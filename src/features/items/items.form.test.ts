import { describe, expect, test } from "bun:test";
import { editItemSchema, itemFormSchema } from "./items.form";

// Each tier's form only sends the fields it shows, so each shape gets a case.
describe("itemFormSchema", () => {
  test("a need sends amounts but no target or deadline", () => {
    const r = itemFormSchema.safeParse({ tier: "need", title: "Rent", floor_amount: "50,000", comfortable_amount: "" });
    expect(r.success && r.data).toEqual({ tier: "need", title: "Rent", target: null, deadline: null, floor_amount: 50000, comfortable_amount: null });
  });
  test("a goal sends a target and deadline but no amounts", () => {
    const r = itemFormSchema.safeParse({ tier: "goal", title: "Ship it", target: "Live", deadline: "2026-12-01" });
    expect(r.success && r.data).toEqual({ tier: "goal", title: "Ship it", target: "Live", deadline: "2026-12-01", floor_amount: null, comfortable_amount: null });
  });
  test("a want or wish sends only a title", () => {
    expect(itemFormSchema.safeParse({ tier: "wish", title: "See the sea" }).success).toBe(true);
  });
  test("a blank title or a bad date is refused", () => {
    expect(itemFormSchema.safeParse({ tier: "want", title: "  " }).success).toBe(false);
    expect(itemFormSchema.safeParse({ tier: "goal", title: "x", deadline: "soon" }).success).toBe(false);
  });
  test("editing needs the item's id", () => {
    expect(editItemSchema.safeParse({ tier: "want", title: "x" }).success).toBe(false);
    expect(editItemSchema.safeParse({ id: "aaaaaaaa-0000-4000-8000-000000000001", tier: "want", title: "x" }).success).toBe(true);
  });
});
