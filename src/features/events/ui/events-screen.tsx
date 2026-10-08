import Link from "next/link";
import { loadSchedule } from "@/features/settings/settings.repo";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { formatLocal } from "@/shared/time";
import { cancelEventAction, finishEventAction, startEventAction } from "../events.actions";
import { inProgress, startable, upcoming, type Quadrant } from "../events";
import { loadUpcomingEvents } from "../events.repo";
import { AddEventForm } from "./add-event-form";
import { SubmitButton } from "@/shared/ui/submit-button";

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
  const byId = new Map(events.map((e) => [e.id, e]));

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
                  <li key={v.id} className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.title}</p>
                      <p className="text-sm text-muted">
                        {v.allDay ? formatLocal(v.at, tz()).slice(0, 10) : formatLocal(v.at, tz())} · {v.daysAway === 0 ? "today" : `in ${v.daysAway}d`}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {/* Today's timed one-offs: start early (its time starts it anyway), or mark done. */}
                      {v.daysAway === 0 && startable(byId.get(v.id)!) && (
                        <>
                          {!inProgress(byId.get(v.id)!, now) && (
                            <form action={startEventAction.bind(null, v.id)} className="flex flex-1">
                              <SubmitButton className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold" aria-label={`Start ${v.title} now`}>Start</SubmitButton>
                            </form>
                          )}
                          <form action={finishEventAction.bind(null, v.id, "done")} className="flex flex-1">
                            <SubmitButton className="flex-1 rounded-xl bg-gold px-3 py-2.5 text-sm font-semibold text-on-gold" aria-label={`Mark ${v.title} done`}>Done</SubmitButton>
                          </form>
                        </>
                      )}
                      <form action={cancelEventAction.bind(null, v.id)} className={v.daysAway === 0 && startable(byId.get(v.id)!) ? "flex flex-1" : "flex"}>
                        <SubmitButton className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm text-muted" aria-label={`Cancel ${v.title}`}>Cancel</SubmitButton>
                      </form>
                    </div>
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
