import { completeTask, createTask } from "@/features/tasks/tasks.repo";
import type { Db } from "@/shared/supabase/token-client";
import { BUCKET_WEIGHTS, BUCKET_XP, isBucketList, progressOf } from "./lists";

type ItemRow = { id: string; text: string; note: string | null; done: boolean; done_at: string | null; position: number };
type ListRow = { id: string; title: string; description: string | null; show_progress: boolean; created_at: string; list_items: ItemRow[] };

const COLUMNS = "id, title, description, show_progress, created_at, list_items(id, text, note, done, done_at, position)";
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const toList = (l: ListRow) => {
  const items = [...l.list_items].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position);
  return { id: l.id, title: l.title, description: l.description, showProgress: l.show_progress, bucket: isBucketList(l.title), items, progress: progressOf(items) };
};
export type LoadedList = ReturnType<typeof toList>;

export async function loadLists(db: Db): Promise<LoadedList[]> {
  const { data, error } = await db.from("lists").select(COLUMNS).order("created_at");
  if (error) throw new Error(`loading lists: ${error.message}`);
  return (data as unknown as ListRow[]).map(toList);
}

/** By id or title, any case. */
export async function findList(db: Db, ref: string): Promise<LoadedList | null> {
  const r = ref.trim().toLowerCase();
  return (await loadLists(db)).find((l) => (isUuid(r) ? l.id === r : l.title.toLowerCase() === r || (isBucketList(r) && l.bucket))) ?? null;
}

export async function createList(db: Db, input: { title: string; description?: string | null; showProgress?: boolean; items?: string[] }) {
  const { data, error } = await db
    .from("lists")
    .insert({ title: input.title.trim(), description: input.description?.trim() || null, show_progress: input.showProgress ?? true })
    .select("id")
    .single();
  if (error?.code === "23505") return { result: "exists" as const, title: input.title.trim() };
  if (error) throw new Error(`creating the list: ${error.message}`);
  const added = input.items?.length ? await addItems(db, data.id, input.items) : 0;
  return { result: "created" as const, id: data.id, added };
}

export async function addItems(db: Db, listId: string, texts: string[]) {
  const { count } = await db.from("list_items").select("id", { count: "exact", head: true }).eq("list_id", listId);
  const rows = texts.map((t) => t.trim()).filter(Boolean).map((text, i) => ({ list_id: listId, text, position: (count ?? 0) + i }));
  if (!rows.length) return 0;
  const { error } = await db.from("list_items").insert(rows);
  if (error) throw new Error(`adding items: ${error.message}`);
  return rows.length;
}

/**
 * Tick or untick. Ticking a bucket-list item for the first time pays the wish
 * bonus, through a task done on the spot; done_at stays when unticked, so
 * re-ticking never pays twice.
 */
export async function setItemDone(db: Db, itemId: string, done: boolean, now: Date) {
  const { data: item } = await db.from("list_items").select("id, text, done, done_at, list_id, lists(title)").eq("id", itemId).maybeSingle();
  if (!item) return { result: "not_found" as const };
  const firstTime = done && !item.done_at;
  await db.from("list_items").update({ done, ...(firstTime ? { done_at: now.toISOString() } : {}) }).eq("id", itemId);
  let xp = 0;
  const title = (item.lists as { title: string } | null)?.title ?? "";
  if (firstTime && isBucketList(title)) {
    const task = await createTask(db, { title: `Bucket list: ${item.text}`, itemId: null, baseXp: BUCKET_XP, dueDate: null, dueTime: null, recurrence: null, nonNegotiable: false, weights: BUCKET_WEIGHTS }, now);
    if (task.result === "created") {
      const c = await completeTask(db, task.task.id, now);
      if (c.result === "completed") xp = c.xp;
    }
  }
  const { data: all } = await db.from("list_items").select("done").eq("list_id", item.list_id);
  return { result: done ? ("ticked" as const) : ("unticked" as const), text: item.text, xp, progress: progressOf(all ?? []) };
}

export async function updateItem(db: Db, itemId: string, changes: { text?: string; note?: string | null; remove?: boolean }) {
  if (changes.remove) {
    await db.from("list_items").delete().eq("id", itemId);
    return { result: "removed" as const };
  }
  await db.from("list_items").update({ ...(changes.text ? { text: changes.text.trim() } : {}), ...(changes.note !== undefined ? { note: changes.note?.trim() || null } : {}) }).eq("id", itemId);
  return { result: "updated" as const };
}

export async function updateList(db: Db, ref: string, changes: { title?: string; description?: string | null; showProgress?: boolean; remove?: boolean }) {
  const list = await findList(db, ref);
  if (!list) return { result: "not_found" as const };
  if (changes.remove) {
    await db.from("lists").delete().eq("id", list.id);
    return { result: "removed" as const, title: list.title };
  }
  const { error } = await db
    .from("lists")
    .update({
      ...(changes.title ? { title: changes.title.trim() } : {}),
      ...(changes.description !== undefined ? { description: changes.description?.trim() || null } : {}),
      ...(changes.showProgress !== undefined ? { show_progress: changes.showProgress } : {}),
    })
    .eq("id", list.id);
  if (error?.code === "23505") return { result: "exists" as const };
  if (error) throw new Error(`updating the list: ${error.message}`);
  return { result: "updated" as const };
}
