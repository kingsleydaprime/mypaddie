import { CloseScreen } from "@/features/closeout/ui/close-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function ClosePage({ searchParams }: PageProps<"/app/close">) {
  const { m } = await searchParams;
  return <CloseScreen db={await requireDb("/app/close")} message={typeof m === "string" ? m : null} />;
}
