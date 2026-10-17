import { describe, expect, test } from "bun:test";
import { markTaskMissed } from "./tasks.repo";
import type { Db } from "@/shared/supabase/token-client";

describe("markTaskMissed", () => {
  test("returns not_found when task does not exist", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as Db;

    const res = await markTaskMissed(db, "t-missing");
    expect(res).toEqual({ result: "not_found", title: null });
  });

  test("returns already_done when task status is done", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "t-1", title: "Pray", status: "done", base_xp: 10, task_pillars: [] },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Db;

    const res = await markTaskMissed(db, "t-1");
    expect(res).toEqual({ result: "already_done", title: "Pray" });
  });

  test("returns already_missed when task status is missed", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "t-1", title: "Pray", status: "missed", base_xp: 10, task_pillars: [] },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Db;

    const res = await markTaskMissed(db, "t-1");
    expect(res).toEqual({ result: "already_missed", title: "Pray" });
  });

  test("returns cancelled when task status is cancelled", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "t-1", title: "Pray", status: "cancelled", base_xp: 10, task_pillars: [] },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Db;

    const res = await markTaskMissed(db, "t-1");
    expect(res).toEqual({ result: "cancelled", title: "Pray" });
  });

  test("records miss with penalty and honesty bonus when pending", async () => {
    let rpcCalledWith: Record<string, unknown> | null = null;
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "t-1",
                title: "Morning workout",
                status: "pending",
                base_xp: 10,
                task_pillars: [{ pillar: "physical", weight: 100 }],
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: async (fn: string, params: Record<string, unknown>) => {
        expect(fn).toBe("record_miss");
        rpcCalledWith = params;
        return { data: { result: "recorded" }, error: null };
      },
    } as unknown as Db;

    const res = await markTaskMissed(db, "t-1", "Overslept", true);
    expect(res.result).toBe("recorded");
    if (res.result === "recorded") {
      expect(res.title).toBe("Morning workout");
      expect(res.penalty.length).toBeGreaterThan(0);
      expect(res.honesty.length).toBeGreaterThan(0);
    }
    expect(rpcCalledWith).toMatchObject({
      p_task_id: "t-1",
      p_reason: "Overslept",
      p_self_reported: true,
    });
  });
});
