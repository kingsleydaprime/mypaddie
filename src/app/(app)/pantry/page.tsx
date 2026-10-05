import { PantryScreen } from "@/features/pantry/ui/pantry-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function PantryPage() {
  return <PantryScreen db={await requireDb("/pantry")} />;
}
