"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/shared/supabase/session";
import { parseItems } from "./lists";
import { addItems, createList, setItemDone, updateItem, updateList } from "./lists.repo";

export type ListFormState = null | { error: string };

export async function createListAction(_prev: ListFormState, form: FormData): Promise<ListFormState> {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Name the list" };
  const db = await requireDb("/app/lists");
  const r = await createList(db, { title, items: parseItems(String(form.get("items") ?? "")), showProgress: form.get("noProgress") !== "on" });
  if (r.result === "exists") return { error: `You already have "${title}"` };
  revalidatePath("/app/lists");
  redirect(`/app/lists/${r.id}`);
}

export async function startBucketListAction() {
  const db = await requireDb("/app/lists");
  const r = await createList(db, { title: "Bucket list", description: "Things to do in this life." });
  redirect(r.result === "created" ? `/app/lists/${r.id}` : "/app/lists");
}

export async function addItemsAction(listId: string, form: FormData) {
  const items = parseItems(String(form.get("items") ?? ""));
  if (!items.length) return;
  const db = await requireDb(`/app/lists/${listId}`);
  await addItems(db, listId, items);
  revalidatePath(`/app/lists/${listId}`);
}

export async function toggleItemAction(listId: string, itemId: string, done: boolean) {
  const db = await requireDb(`/app/lists/${listId}`);
  await setItemDone(db, itemId, done, new Date());
  revalidatePath(`/app/lists/${listId}`);
  revalidatePath("/app/lists");
}

export async function removeItemAction(listId: string, itemId: string) {
  const db = await requireDb(`/app/lists/${listId}`);
  await updateItem(db, itemId, { remove: true });
  revalidatePath(`/app/lists/${listId}`);
}

export async function deleteListAction(listId: string) {
  const db = await requireDb("/app/lists");
  await updateList(db, listId, { remove: true });
  redirect("/app/lists");
}
