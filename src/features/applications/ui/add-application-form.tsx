"use client";

import { useActionState } from "react";
import { APPLICATION_KINDS } from "../applications";
import { addApplicationAction, type AppFormState } from "../applications.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const ZONES = ["Africa/Lagos", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "UTC"];

export function AddApplicationForm() {
  const [state, action, pending] = useActionState<AppFormState, FormData>(addApplicationAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4" open={state !== null}>
      <summary className="cursor-pointer font-bold">+ Add application</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input name="title" required placeholder="What? e.g. Chevening Scholarship" className={field} />
        <div className="grid grid-cols-2 gap-2">
          <input name="org" placeholder="Organisation" className={field} />
          <select name="kind" defaultValue="job" className={field} aria-label="Kind">
            {APPLICATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <input name="link" type="url" placeholder="Link (https://…)" className={field} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-muted">Deadline, exactly as published (leave the date empty if rolling)</legend>
          <div className="grid grid-cols-2 gap-2">
            <input name="date" type="date" className={field} aria-label="Deadline date" />
            <input name="time" type="time" defaultValue="23:59" className={field} aria-label="Deadline time" />
          </div>
          <input name="tz" list="tz-list" defaultValue="Africa/Lagos" placeholder="Their time zone" className={field} aria-label="Deadline time zone" />
          <datalist id="tz-list">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
        </fieldset>
        <textarea name="requirements" rows={3} placeholder={"Requirements, one per line\nCV\nTranscript\n500-word essay"} className={field} />
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Adding…" : "Add"}</button>
      </form>
    </details>
  );
}
