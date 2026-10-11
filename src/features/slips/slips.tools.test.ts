import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerSlipTools } from "./slips.tools";

describe("registerSlipTools", () => {
  test("adds a self-reported missed-task tool", () => {
    const calls: Array<[string, unknown]> = [];
    const server = {
      registerTool: (name: string, ...rest: unknown[]) => {
        calls.push([name, rest[0]]);
      },
    } as unknown as McpServer;

    registerSlipTools(server);

    expect(calls.some(([name]) => name === "mark_task_missed")).toBe(true);
  });
});
