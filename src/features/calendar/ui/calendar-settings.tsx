"use client";

import { useActionState, useState, useTransition } from "react";
import { connectCalendarAction, disconnectCalendarAction, syncCalendarAction, type CalendarState } from "../calendar.actions";

type Status = { connected: false } | { connected: true; url: string; lastSyncAt: string | null; lastCount: number | null; lastError: string | null };

export function CalendarSettings({ status }: { status: Status }) {
  const [state, connect, connecting] = useActionState<CalendarState, FormData>(connectCalendarAction, null);
  const [other, setOther] = useState<CalendarState>(null);
  const [busy, start] = useTransition();
  const msg = other ?? state;

  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Google Calendar {status.connected && <span className="text-sm font-normal text-green">· connected</span>}</summary>
      {status.connected ? (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <p className="text-muted">Importing from <span className="break-all">{status.url}</span></p>
          <p className="text-muted">
            {status.lastError ? <span className="text-red">Last sync failed: {status.lastError}</span> : status.lastSyncAt ? `Last synced ${new Date(status.lastSyncAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · ${status.lastCount ?? 0} events` : "Not synced yet"}
          </p>
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={busy} onClick={() => start(async () => setOther(await syncCalendarAction()))} className="flex-1 rounded-xl bg-gold px-3 py-2.5 font-semibold text-on-gold disabled:opacity-60">Sync now</button>
            <button type="button" disabled={busy} onClick={() => start(async () => setOther(await disconnectCalendarAction()))} className="rounded-xl border border-line px-3 py-2.5 text-muted">Disconnect</button>
          </div>
        </div>
      ) : (
        <form action={connect} className="mt-3 flex flex-col gap-2 text-sm">
          <p className="text-muted">
            Google Calendar → Settings → your calendar → <em>Integrate calendar</em> → copy the <strong>Secret address in iCal format</strong>. Treat it like a password.
          </p>
          <input name="url" type="url" required placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base" />
          <button disabled={connecting} className="rounded-xl bg-gold px-3 py-2.5 font-semibold text-on-gold disabled:opacity-60">{connecting ? "Connecting…" : "Connect"}</button>
        </form>
      )}
      {msg && <p className={`mt-2 text-sm ${"error" in msg ? "text-red" : "text-green"}`} role={"error" in msg ? "alert" : "status"}>{"error" in msg ? msg.error : msg.ok}</p>}
    </details>
  );
}
