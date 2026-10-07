import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { localTimeOf } from "@/shared/time";
import { SubmitButton } from "@/shared/ui/submit-button";
import { STATUS_INFO, STATUS_KINDS } from "../status";
import { clearStatusAction, setStatusAction } from "../status.actions";
import { loadStatus } from "../status.repo";

const HOLD_NOTE = { all: "Paddie's holding everything till then.", soft: "Only what's coming up gets through.", none: "" } as const;

/** Where you are, on Today: what's set and what it means, or a quick way to set it. */
export async function StatusBar({ db }: { db: Db }) {
  const now = new Date();
  const status = await loadStatus(db, now);
  // A sensible default end: two hours from now, on the half hour.
  const later = new Date(Math.ceil((now.getTime() + 2 * 3_600_000) / 1_800_000) * 1_800_000);
  const defaultUntil = localTimeOf(later, currentConfig().timeZone);

  if (status) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {status.label}{status.note ? ` · ${status.note}` : ""} <span className="font-normal text-muted">till {status.until}</span>
          </p>
          <p className="text-sm text-muted">{HOLD_NOTE[status.hold]}</p>
        </div>
        {status.source === "manual" && (
          <form action={clearStatusAction}>
            <SubmitButton className="rounded-xl border border-line px-3 py-2 text-sm font-medium">I&apos;m back</SubmitButton>
          </form>
        )}
      </div>
    );
  }
  return (
    <details className="rounded-2xl border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Where are you? <span className="text-muted">So Paddie knows when to hold off</span></summary>
      <form action={setStatusAction} className="mt-3 flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Where you are</legend>
          {STATUS_KINDS.filter((k) => k !== "in_class").map((k, i) => (
            <label key={k} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-on-gold">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="sr-only" />
              {STATUS_INFO[k].label}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-sm text-muted">
          Until
          <input type="time" name="until" required defaultValue={defaultUntil} className="rounded-xl border border-line bg-surface px-3 py-2 text-base text-current" />
        </label>
        <SubmitButton className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold">Set</SubmitButton>
      </form>
    </details>
  );
}
