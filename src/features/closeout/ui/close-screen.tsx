import Link from "next/link";
import { formatMoney } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { addDays } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SLIP_REASONS } from "../closeout";
import { closeDayAction, decideAction } from "../closeout.actions";
import { loadCloseOut } from "../closeout.repo";

const card = "rounded-2xl border border-line bg-surface px-4 py-3";
const small = "rounded-xl border border-line px-3 py-2 text-sm font-medium";
const field = "rounded-xl border border-line bg-surface px-3 py-2.5 text-base placeholder:text-muted";

/** The evening wrap-up: decide what's open, name a win, see tomorrow, close. */
export async function CloseScreen({ db, message }: { db: Db; message: string | null }) {
  const c = await loadCloseOut(db, new Date());
  const tomorrow = c.tomorrow;
  const dayAfter = addDays(tomorrow.day, 1);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app" className="text-muted" aria-label="Back to today">‹ Today</Link>
        <h1 className="text-2xl font-bold">Close out the day</h1>
      </header>
      {message && <p className="rounded-xl border border-line px-4 py-3 text-sm" role="status">{message}</p>}

      <p className="text-muted">
        {c.read.done} done{c.read.open > 0 ? `, ${c.read.open} still open` : ""}.{" "}
        {c.read.carriedOver.length > 0 && <span>{c.read.carriedOver.join(", ")} keep{c.read.carriedOver.length === 1 ? "s" : ""} getting moved — shrink it to a first step, or drop it.</span>}
      </p>

      {c.unfinished.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Still open</h2>
          <ul className="flex flex-col gap-2">
            {c.unfinished.map((t) => (
              <li key={t.id} className={card}>
                <p className="font-semibold">{t.title}</p>
                <p className="text-sm text-muted">
                  {t.overdueDays === 0 ? "Due today" : `Due ${t.overdueDays} day${t.overdueDays === 1 ? "" : "s"} ago`}
                  {t.need ? " · need" : ""}{t.habit ? " · habit" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.options.includes("move") && (
                    <>
                      <form action={decideAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="kind" value="move" />
                        <input type="hidden" name="to" value={tomorrow.day} />
                        <SubmitButton className={small}>Tomorrow</SubmitButton>
                      </form>
                      <form action={decideAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="kind" value="move" />
                        <input type="hidden" name="to" value={dayAfter} />
                        <SubmitButton className={small}>Day after</SubmitButton>
                      </form>
                    </>
                  )}
                  {t.options.includes("drop") && (
                    <form action={decideAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="kind" value="drop" />
                      <SubmitButton className={small}>Drop it</SubmitButton>
                    </form>
                  )}
                </div>
                <form action={decideAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="kind" value="slipped" />
                  <select name="category" required defaultValue="" className={`${field} min-w-0 flex-1 text-sm`} aria-label={`Why "${t.title}" slipped`}>
                    <option value="" disabled>It slipped because…</option>
                    {SLIP_REASONS.map((r) => (
                      <option key={r.category} value={r.category}>{r.label}</option>
                    ))}
                  </select>
                  <SubmitButton className={small}>Own it</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Tomorrow</h2>
        <div className={card}>
          {tomorrow.events.length + tomorrow.tasks.length + tomorrow.bills.length === 0 ? (
            <p className="text-sm text-muted">Nothing planned yet. Plan my day works in the morning too.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {tomorrow.events.map((e) => <li key={`e-${e.title}`}><span className="text-muted">{e.at ?? "All day"}</span> · {e.title}</li>)}
              {tomorrow.bills.map((b) => <li key={`b-${b.title}`}><span className="text-muted">Bill</span> · {b.title} {formatMoney(b.amount)}</li>)}
              {tomorrow.tasks.map((t, i) => <li key={`t-${i}`}><span className="text-muted">{t.at ?? "Any time"}</span> · {t.title}</li>)}
            </ul>
          )}
          <p className="mt-2 text-sm text-muted">
            {Math.round(tomorrow.room.committedMinutes / 6) / 10}h planned of {Math.round(tomorrow.room.capacityMinutes / 6) / 10}h.
          </p>
        </div>
      </section>

      <form action={closeDayAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          One win today
          <textarea name="win" rows={2} maxLength={500} defaultValue={c.alreadyClosed?.win ?? ""} placeholder="Small counts." className={field} />
        </label>
        <SubmitButton className="rounded-xl bg-gold px-4 py-3.5 font-semibold text-on-gold">
          {c.alreadyClosed ? "Update" : "Close the day"}
        </SubmitButton>
        {c.alreadyClosed && <p className="text-center text-sm text-muted">Closed — you can still add to it.</p>}
      </form>
    </div>
  );
}
