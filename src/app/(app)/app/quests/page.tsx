import { QuestsScreen } from "@/features/items/ui/quests-screen";
import { TIERS, type Tier } from "@/shared/domain";
import { requireDb } from "@/shared/supabase/session";

export default async function QuestsPage({ searchParams }: PageProps<"/app/quests">) {
  const { tier, status } = await searchParams;
  const valid = TIERS.includes(tier as Tier) ? (tier as Tier) : null;
  const shown = (["paused", "done", "dropped"] as const).find((s) => s === status) ?? "active";
  return <QuestsScreen db={await requireDb("/app/quests")} tier={valid} status={shown} />;
}
