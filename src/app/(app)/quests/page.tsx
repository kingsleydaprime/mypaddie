import { QuestsScreen } from "@/features/items/ui/quests-screen";
import { TIERS, type Tier } from "@/shared/domain";
import { requireDb } from "@/shared/supabase/session";

export default async function QuestsPage({ searchParams }: PageProps<"/quests">) {
  const { tier } = await searchParams;
  const valid = TIERS.includes(tier as Tier) ? (tier as Tier) : null;
  return <QuestsScreen db={await requireDb("/quests")} tier={valid} />;
}
