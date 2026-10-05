import Link from "next/link";
import { AddItemForm } from "@/features/items/ui/add-item-form";
import { TIERS, type Tier } from "@/shared/domain";
import { requireDb } from "@/shared/supabase/session";

export default async function NewQuestPage({ searchParams }: PageProps<"/app/quests/new">) {
  await requireDb("/app/quests/new");
  const { tier } = await searchParams;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Back</Link>
        <h1 className="text-2xl font-bold">New quest</h1>
      </header>
      <AddItemForm initialTier={TIERS.includes(tier as Tier) ? (tier as Tier) : "goal"} />
    </div>
  );
}
