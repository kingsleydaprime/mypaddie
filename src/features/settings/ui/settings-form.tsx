"use client";

import { useActionState } from "react";
import type { Schedule } from "../schedule";
import { saveSettingsAction, type SettingsState } from "../settings.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

function Time({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <input type="time" name={name} defaultValue={value} required className={field} />
    </label>
  );
}

export function SettingsForm({ schedule }: { schedule: Schedule }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Schedule</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <Time name="quietStart" label="Quiet from" value={schedule.quietStart} />
        <Time name="quietEnd" label="Quiet until" value={schedule.quietEnd} />
        <Time name="briefAt" label="Morning brief" value={schedule.briefAt} />
        <Time name="eveningAt" label="Evening-before reminders" value={schedule.eveningAt} />
        <Time name="morningAt" label="Morning-of reminders" value={schedule.morningAt} />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Events count as close within (days)</span>
          <input type="number" name="eventCloseDays" min={1} max={60} defaultValue={schedule.eventCloseDays} required className={`${field} w-20`} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Nudge me after this many days without fun (0 = off)</span>
          <input type="number" name="funEveryDays" min={0} max={60} defaultValue={schedule.funEveryDays} required className={`${field} w-20`} />
        </label>
        <Time name="funAt" label="Fun nudge at" value={schedule.funAt} />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Evening close-out push</span>
          <input type="checkbox" name="closeOut" defaultChecked={schedule.closeOut} className="h-5 w-5 accent-gold" />
        </label>
        <Time name="closeAt" label="Close out the day at" value={schedule.closeAt} />
        <Time name="anyTimeNudgeFrom" label="Nudge any-time must-dos from" value={schedule.anyTimeNudgeFrom} />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Show timed tasks on top from (minutes before)</span>
          <input type="number" name="showTimedWithin" min={0} max={720} step={15} defaultValue={schedule.showTimedWithin} required className={`${field} w-20`} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">My week starts on</span>
          <select name="weekStart" defaultValue={schedule.weekStart} className={field}>
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Phone-free after waking (minutes, 0 = off)</span>
          <input type="number" name="phoneFreeMorning" min={0} max={240} step={15} defaultValue={schedule.phoneFreeMorning} required className={`${field} w-20`} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Phone-free before quiet hours (minutes, 0 = off)</span>
          <input type="number" name="phoneFreeEvening" min={0} max={240} step={15} defaultValue={schedule.phoneFreeEvening} required className={`${field} w-20`} />
        </label>
        <p className="text-xs text-muted">
          Meals: {schedule.meals.map((m) => `${m.name} ${m.at}`).join(" · ")} — change these by asking Paddie.
        </p>
        {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
        {state && "ok" in state && <p className="text-sm text-green" role="status">Saved.</p>}
        <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
}
