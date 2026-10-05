import { MoneyScreen } from "@/features/money/ui/money-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function MoneyPage({ searchParams }: PageProps<"/app/money">) {
  const { add } = await searchParams;
  return <MoneyScreen db={await requireDb("/app/money")} addMoney={add === "in"} />;
}
