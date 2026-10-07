import Link from "next/link";
import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { formatLocal } from "@/shared/time";
import { cancelEventAction } from "../events.actions";
import { upcoming, type Quadrant } from "../events";
import { loadUpcomingEvents } from "../events.repo";
import { AddEventForm } from "./add-event-form";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const GROUPS: { q: Quadrant; title: string; blurb: string }[] = [
  { q: "prepare_now", title: "Prepare now", blurb: "Important and close." },
  { q: "plan_ahead", title: "Plan ahead", blurb: "Important, further out. Anything to prepare?" },
  { q: "fit_in", title: "Fit in", blurb: "Soon, not important — only if there's room." },
  { q: "someday", title: "Someday", blurb: "Not important, not soon." },
];

export async function EventsScreen({ db }: { db: Db }) {
  const now = new Date();
  const [events, schedule] = await Promise.all([loadUpcomingEvents(db), loadSchedule(db)]);
  const views = upcoming(events, now, 120, undefined, schedule.eventCloseDays);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">Events</h1>
      </header>
      <AddEventForm />
      {views.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nothing in the next four months.</p>
      ) : (
        GROUPS.map(({ q, title, blurb }) => {
          const list = views.filter((v) => v.quadrant === q);
          if (list.length === 0) return null;
          return (
            <section key={q} className="flex flex-col gap-2">
              <h2 className={`font-bold ${q === "prepare_now" ? "text-gold" : ""}`}>{title}</h2>
              <p className="-mt-1 text-sm text-muted">{blurb}</p>
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {list.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.title}</p>
                      <p className="text-sm text-muted">
                        {v.allDay ? formatLocal(v.at, tz()).slice(0, 10) : formatLocal(v.at, tz())} · {v.daysAway === 0 ? "today" : `in ${v.daysAway}d`}
                      </p>
                    </div>
                    <form action={cancelEventAction.bind(null, v.id)}>
                      <button className="text-sm text-muted" aria-label={`Cancel ${v.title}`}>Cancel</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
