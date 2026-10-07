import Link from "next/link";
import { notFound } from "next/navigation";
import { completionPays } from "@/features/items/items";
import { AddItemForm } from "@/features/items/ui/add-item-form";
import { ItemStatusPanel } from "@/features/items/ui/item-status-panel";
import { currentConfig } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";

const STATUS_NOTE = { active: null, paused: "Paused.", dropped: "Dropped.", done: "Done." } as const;

export default async function QuestPage({ params }: PageProps<"/app/quests/[id]">) {
  const { id } = await params;
  const db = await requireDb(`/app/quests/${id}`);
  const { data: item } = await db
    .from("items")
    .select("id, tier, title, target, deadline, status, floor_amount, comfortable_amount")
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href={`/app/quests?tier=${item.tier}`} className="text-muted" aria-label="Back to quests">‹ Back</Link>
        <h1 className="truncate text-2xl font-bold">Edit quest</h1>
      </header>
      {STATUS_NOTE[item.status] && <p className="text-sm text-muted">{STATUS_NOTE[item.status]}</p>}
      <AddItemForm
        initialTier={item.tier}
        currency={currentConfig().currency}
        item={{
          id: item.id,
          tier: item.tier,
          title: item.title,
          target: item.target,
          deadline: item.deadline,
          floorAmount: item.floor_amount,
          comfortableAmount: item.comfortable_amount,
        }}
      />
      <ItemStatusPanel id={item.id} status={item.status} pays={completionPays(item.tier)} />
    </div>
  );
}
