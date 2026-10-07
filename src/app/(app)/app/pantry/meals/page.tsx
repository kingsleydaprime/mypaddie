import { MealsScreen } from "@/features/pantry/ui/meals-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function MealsPage({ searchParams }: PageProps<"/app/pantry/meals">) {
  const { not } = await searchParams;
  const exclude = typeof not === "string" ? not.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) : [];
  return <MealsScreen db={await requireDb("/app/pantry/meals")} exclude={exclude} />;
}
