import { TasksScreen } from "@/features/tasks/ui/tasks-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function TasksPage() {
  return <TasksScreen db={await requireDb("/app/tasks")} />;
}
