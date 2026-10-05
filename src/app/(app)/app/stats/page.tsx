import { StatsScreen } from "@/features/stats/ui/stats-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function StatsPage() {
  return <StatsScreen db={await requireDb("/app/stats")} />;
}
