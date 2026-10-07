import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMode } from "@/features/mode/mode.repo";
import { dbFrom, ok, toolError, type ToolContext } from "@/shared/mcp/kit";
import { CONTACT_HOW, RELATIONS, type ContactHow, type Relation } from "./people";
import { addPerson, loadPeoplePicture, logContact, updatePerson } from "./people.repo";

const fields = {
  relation: z.enum(RELATIONS).optional(),
  who: z.string().trim().max(200).optional().describe("What they are to them, in their words: 'my sister', 'my manager at Acme'"),
  notes: z.string().trim().max(2000).optional().describe("What matters about them: their kids' names, what they're going through, what they like"),
  birthday: z.iso.date().optional().describe("Any year is fine if they don't know it"),
  reach_out_every_days: z.number().int().min(1).max(730).optional().describe("Keep in touch at least this often (e.g. 7 for mum, 30 for an old friend)"),
  topics: z.array(z.string().trim().min(1).max(200)).optional().describe("Things to talk about next time"),
  close: z.boolean().optional(),
};

export function registerPeopleTools(server: McpServer) {
  server.registerTool(
    "list_people",
    {
      title: "People",
      description:
        "The people in their life: who each is to them, notes, when they last spoke, who's due a check-in (`due`), " +
        "birthdays coming up (`birthdayIn` days), things to talk about, recent contacts, and open promises to them. " +
        "Nudge them to reach out to one or two people who are due — say why and suggest something to talk about. " +
        "Use what you know about someone when they come up in conversation.",
      inputSchema: z.object({ due_only: z.boolean().default(false), name: z.string().trim().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ due_only, name }: { due_only: boolean; name?: string }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        let people = await loadPeoplePicture(db, now);
        if (name) people = people.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
        if (due_only) people = people.filter((p) => p.due || (p.birthdayIn !== null && p.birthdayIn <= 14));
        return ok(await withMode(db, now, { people: people.map((p) => ({ ...p, createdAt: undefined })) }));
      } catch (error) {
        return toolError(`list_people failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "add_person",
    {
      title: "Add person",
      description:
        "Someone who matters to them — family, friends, colleagues, mentors, church or club people. Listen for people " +
        "they mention more than once and offer to add them. A birthday goes on the calendar too.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(100), ...fields }),
    },
    async (args: { name: string; relation?: Relation; who?: string; notes?: string; birthday?: string; reach_out_every_days?: number; topics?: string[]; close?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        const r = await addPerson(db, { ...args, reachOutEveryDays: args.reach_out_every_days }, now);
        return ok(await withMode(db, now, r.result === "added" ? { result: r.result, name: r.person.name, birthdayOnCalendar: r.birthdayOnCalendar } : { ...r }));
      } catch (error) {
        return toolError(`add_person failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "update_person",
    {
      title: "Update person",
      description: "Edit someone (by name): what they are to them, notes, birthday, rhythm, closeness; add or remove things to talk about; or remove them.",
      inputSchema: z.object({
        person: z.string().trim().min(1),
        name: z.string().trim().min(1).max(100).optional().describe("New name"),
        ...fields,
        add_topics: z.array(z.string().trim().min(1).max(200)).optional(),
        remove_topics: z.array(z.string().trim().min(1)).optional(),
        reach_out_every_days: z.number().int().min(1).max(730).nullable().optional(),
        remove: z.boolean().optional(),
      }),
    },
    async (args: { person: string; name?: string; relation?: Relation; who?: string; notes?: string; birthday?: string; reach_out_every_days?: number | null; topics?: string[]; close?: boolean; add_topics?: string[]; remove_topics?: string[]; remove?: boolean }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const { person, reach_out_every_days, add_topics, remove_topics, ...rest } = args;
        return ok(await withMode(db, new Date(), { ...(await updatePerson(db, person, { ...rest, reachOutEveryDays: reach_out_every_days, addTopics: add_topics, removeTopics: remove_topics })) }));
      } catch (error) {
        return toolError(`update_person failed: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "log_contact",
    {
      title: "Log contact",
      description:
        "They were in touch with someone (call, text, visit…). Records it with a note, resets the check-in clock, " +
        "removes topics they covered, and pays Relationships XP.",
      inputSchema: z.object({
        person: z.string().trim().min(1),
        how: z.enum(CONTACT_HOW).default("chat"),
        note: z.string().trim().max(1000).optional(),
        covered_topics: z.array(z.string().trim().min(1)).optional(),
      }),
    },
    async (args: { person: string; how: ContactHow; note?: string; covered_topics?: string[] }, ctx: ToolContext) => {
      try {
        const db = dbFrom(ctx);
        const now = new Date();
        return ok(await withMode(db, now, { ...(await logContact(db, args.person, { how: args.how, note: args.note, coveredTopics: args.covered_topics }, now)) }));
      } catch (error) {
        return toolError(`log_contact failed: ${(error as Error).message}`);
      }
    },
  );
}
