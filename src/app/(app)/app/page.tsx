import { redirect } from "next/navigation";
import { TodayScreen } from "@/features/today/ui/today-screen";
import { requireDb } from "@/shared/supabase/session";
import { currentProfile } from "@/shared/user-context";

export default async function TodayPage() {
  const db = await requireDb("/app");
  // First visit: set up name, time zone, currency and voice before anything else.
  if (!currentProfile().onboardedAt) redirect("/welcome");
  return <TodayScreen db={db} />;
}
