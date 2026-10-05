import Link from "next/link";
import { markSentAction } from "@/features/updates/updates.actions";
import { listUpdates } from "@/features/updates/updates.repo";
import { AddUpdateForm } from "@/features/updates/ui/add-update-form";
import { DEFAULT_CONFIG } from "@/shared/config";
import { requireDb } from "@/shared/supabase/session";
import { formatLocal } from "@/shared/time";

const DAY: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
const cadence = (rule: string | null) => (rule ? `every ${(rule.match(/BYDAY=([A-Z,]+)/)?.[1] ?? "").split(",").map((d) => DAY[d] ?? d).join(", ") || "day"}` : "one-off");

export default async function UpdatesPage() {
  const db = await requireDb("/app/updates");
  const updates = (await listUpdates(db)).filter((u) => u.active);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Updates</h1>
      </header>
      <p className="text-sm text-muted">Ask Paddie &ldquo;draft my update to …&rdquo; — it writes from what you actually did since the last one.</p>
      <AddUpdateForm />
      {updates.length === 0 && <p className="text-sm text-muted">No updates yet.</p>}
      <ul className="flex flex-col gap-2">
        {updates.map((u) => {
          const t = u.tasks as unknown as { recurrence: string | null } | null;
          return (
            <li key={u.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.recipient}</p>
                <p className="truncate text-sm text-muted">{u.about} · {u.channel} · {cadence(t?.recurrence ?? null)}</p>
                <p className="text-xs text-muted">Last sent: {u.last_sent_at ? formatLocal(new Date(u.last_sent_at), DEFAULT_CONFIG.timeZone) : "never"}</p>
              </div>
              <form action={markSentAction.bind(null, u.id)}>
                <button className="rounded-xl border border-line px-3 py-2 text-sm font-medium">Sent ✓</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
