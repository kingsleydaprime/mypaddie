import { describe, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { catalogue } from "./help.tools";

describe("catalogue", () => {
  test("records every tool, under the area that registered it, and still registers it", () => {
    const server = new McpServer({ name: "t", version: "1" });
    const tools = catalogue(server);
    const add = (name: string) =>
      server.registerTool(name, { title: name, description: `Does ${name}. More detail.`, inputSchema: z.object({}) }, async () => ({ content: [] }));
    tools.area("Money", () => {
      add("log_transaction");
      add("check_purchase");
    });
    tools.area("School", () => add("add_course"));
    expect(tools.entries.map((e) => [e.area, e.name])).toEqual([
      ["Money", "log_transaction"],
      ["Money", "check_purchase"],
      ["School", "add_course"],
    ]);
    expect(tools.entries[0]!.description).toBe("Does log_transaction. More detail.");
  });
});
