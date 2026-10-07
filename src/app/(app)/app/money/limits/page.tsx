import { LimitsScreen } from "@/features/money/ui/limits-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function LimitsPage({ searchParams }: PageProps<"/app/money/limits">) {
  const { e } = await searchParams;
  return <LimitsScreen db={await requireDb("/app/money/limits")} error={typeof e === "string" ? e : null} />;
}
