import { MoneyScreen } from "@/features/money/ui/money-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const { add } = await searchParams;
  return <MoneyScreen db={await requireDb("/money")} addMoney={add === "in"} />;
}
