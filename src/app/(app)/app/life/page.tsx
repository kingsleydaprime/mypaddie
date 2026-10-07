import { LifeScreen } from "@/features/life/ui/life-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function LifePage({ searchParams }: PageProps<"/app/life">) {
  const { m } = await searchParams;
  return <LifeScreen db={await requireDb("/app/life")} message={typeof m === "string" ? m : null} />;
}
