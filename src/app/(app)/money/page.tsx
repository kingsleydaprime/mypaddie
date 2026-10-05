import { MoneyScreen } from "@/features/money/ui/money-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function MoneyPage() {
  return <MoneyScreen db={await requireDb("/money")} />;
}
