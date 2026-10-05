"use client";

import { useActionState, useState } from "react";
import { CHANNELS } from "../updates";
import { addUpdateAction, type UpdateFormState } from "../updates.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const DAYS = [["", "One-off"], ["MO", "Mondays"], ["TU", "Tuesdays"], ["WE", "Wednesdays"], ["TH", "Thursdays"], ["FR", "Fridays"], ["SA", "Saturdays"], ["SU", "Sundays"]] as const;

export function AddUpdateForm() {
  const [key, setKey] = useState(0);
  const [weekday, setWeekday] = useState("FR");
  const [state, action, pending] = useActionState<UpdateFormState, FormData>(async (prev, form) => {
    const next = await addUpdateAction(prev, form);
    if (next && "ok" in next) setKey((k) => k + 1);
    return next;
  }, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">+ Add update</summary>
      <form key={key} action={action} className="mt-3 flex flex-col gap-3">
        <input name="recipient" required placeholder="For whom? e.g. Tobi (manager)" className={field} />
        <input name="about" required placeholder="About what? e.g. weekly API progress" className={field} />
        <input name="format" placeholder="Format (optional): 3 bullets — done, next, blockers" className={field} />
        <div className="grid grid-cols-2 gap-2">
          <select name="channel" defaultValue="email" className={field} aria-label="Channel">
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="weekday" value={weekday} onChange={(e) => setWeekday(e.target.value)} className={field} aria-label="How often">
            {DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {!weekday && <input name="date" type="date" required className={field} aria-label="Due date" />}
          <input name="time" type="time" defaultValue="16:00" className={field} aria-label="Time" />
        </div>
        {state && <p className={`text-sm ${"error" in state ? "text-red" : "text-green"}`} role={"error" in state ? "alert" : "status"}>{"error" in state ? state.error : state.ok}</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">{pending ? "Adding…" : "Add"}</button>
      </form>
    </details>
  );
}
