import { HISTORY_TABS, HistoryScreen, type HistoryTab } from "@/features/tasks/ui/history-screen";
import { requireDb } from "@/shared/supabase/session";

export default async function HistoryPage({ searchParams }: PageProps<"/app/history">) {
  const { show, weeks } = await searchParams;
  const tab = HISTORY_TABS.includes(show as HistoryTab) ? (show as HistoryTab) : "open";
  const w = Math.min(52, Math.max(1, Number(weeks) || 4));
  return <HistoryScreen db={await requireDb("/app/history")} tab={tab} weeks={w} />;
}
