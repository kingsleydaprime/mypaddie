import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "@/shared/config";
import { matchesTaskHistoryStatus, taskHistoryRecord, type TaskHistoryRow } from "./history";

const task = (overrides: Partial<TaskHistoryRow> = {}): TaskHistoryRow => ({
  id: "task-1",
  title: "Morning reading",
  status: "done",
  due_at: "2026-10-10T07:00:00.000Z",
  done_at: "2026-10-10T08:00:00.000Z",
  created_at: "2026-10-01T09:00:00.000Z",
  occurs_on: null,
  duration_minutes: null,
  routine_step: null,
  routines: null,
  ...overrides,
});

describe("taskHistoryRecord", () => {
  test("keeps slip and late as separate outcomes and returns both slip reason fields", () => {
    const record = taskHistoryRecord(
      task(),
      [{ why: "I stayed up too late", why_category: "late night", accepted: true, at: "2026-10-10T07:30:00.000Z" }],
      null,
      "Africa/Lagos",
      "22:00",
      DEFAULT_CONFIG,
    );

    expect(record.date).toBe("2026-10-10");
    expect(record.status).toBe("done");
    expect(record.outcomes).toEqual(["done", "slipped", "late"]);
    expect(record.slips).toEqual([
      { why: "I stayed up too late", why_category: "late night", accepted: true, at: "2026-10-10T07:30:00.000Z" },
    ]);
  });

  test("uses the occurrence date and includes the explicit miss reason", () => {
    const record = taskHistoryRecord(
      task({ status: "missed", occurs_on: "2026-10-09", due_at: null, done_at: null }),
      [],
      { reason: "Service ran long", at: "2026-10-09T12:00:00.000Z", self_reported: true },
      "Africa/Lagos",
      "22:00",
      DEFAULT_CONFIG,
    );

    expect(record.date).toBe("2026-10-09");
    expect(record.status).toBe("missed");
    expect(record.outcomes).toEqual(["missed"]);
    expect(record.miss?.reason).toBe("Service ran long");
  });

  test("does not label a time block late merely because it ended after its start time", () => {
    const record = taskHistoryRecord(
      task({ duration_minutes: 60 }),
      [],
      null,
      "Africa/Lagos",
      "22:00",
      DEFAULT_CONFIG,
    );

    expect(record.late).toBe(false);
    expect(matchesTaskHistoryStatus(record, "late")).toBe(false);
  });

  test("matches both stored statuses and derived outcomes", () => {
    const record = taskHistoryRecord(task(), [], null, "Africa/Lagos", "22:00", DEFAULT_CONFIG);

    expect(matchesTaskHistoryStatus(record, "done")).toBe(true);
    expect(matchesTaskHistoryStatus(record, "late")).toBe(true);
    expect(matchesTaskHistoryStatus(record, "slipped")).toBe(false);
    expect(matchesTaskHistoryStatus(record, undefined)).toBe(true);
  });
});