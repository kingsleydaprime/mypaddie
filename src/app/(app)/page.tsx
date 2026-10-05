import { TodayScreen } from "@/features/today/ui/today-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function TodayPage() {
  return <TodayScreen db={await requireDb("/")} />;
}
