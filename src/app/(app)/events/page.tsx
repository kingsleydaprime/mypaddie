import { EventsScreen } from "@/features/events/ui/events-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function EventsPage() {
  return <EventsScreen db={await requireDb("/events")} />;
}
