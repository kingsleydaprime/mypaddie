"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Quit, QuitStatus } from "../quits.repo";
import { deleteQuitAction, setQuitCapAction, setQuitStatusAction, updateQuitAction } from "../quits.actions";
import { unitLabel } from "./labels";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

type Res = { error: string } | { result: string };
const CAP_LINE: Record<string, string> = {
  lowered: "Cap lowered. Your streak carries on under it, from today.",
  raised: "Cap raised. That starts a new attempt from day 0.",
  unchanged: "That's the cap already.",
};

/** The real name, the private name, the why, where it shows, the cap, and stopping or deleting. */
export function QuitSettings({ quit }: { quit: Quit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [confirm, setConfirm] = useState<null | "ended" | "paused" | "delete">(null);

  const run = (fn: () => Promise<Res>, ok: (r: { result: string }) => string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return setMsg({ text: res.error, error: true });
      if (res.result === "already_tracking") return setMsg({ text: "You're already tracking something with that name.", error: true });
      setMsg({ text: ok(res), error: false });
      setConfirm(null);
      after?.();
    });

  function saveDetails(form: FormData) {
    const get = (k: string) => String(form.get(k) ?? "");
    run(
      () => updateQuitAction(quit.id, {
        title: get("title"),
        alias: get("alias"),
        why: get("why"),
        onHome: form.get("on_home") === "on",
        showNameToAi: form.get("show_name") === "on",
      }),
      () => "Saved.",
    );
  }

  const setStatus = (status: QuitStatus) =>
    run(() => setQuitStatusAction(quit.id, status), () =>
      status === "active" ? "Back on. Day 0 starts now." : status === "paused" ? "Paused. Resuming starts again from day 0." : "Ended. Your history and XP stay.");

  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Settings</summary>
      <div className="mt-3 flex flex-col gap-5">
        <form action={saveDetails} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Real name
            <input name="title" required maxLength={80} defaultValue={quit.title} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Private name (shown instead, and all Paddie sees)
            <input name="alias" maxLength={40} defaultValue={quit.alias ?? ""} placeholder="e.g. Project P" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Why
            <textarea name="why" maxLength={300} rows={2} defaultValue={quit.why ?? ""} className={field} />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input name="on_home" type="checkbox" defaultChecked={quit.onHome} className="h-5 w-5" /> Show the day count on Home
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input name="show_name" type="checkbox" defaultChecked={quit.showNameToAi} className="mt-0.5 h-5 w-5" />
            <span>Let Paddie see the real name<span className="block text-xs text-muted">Off: Paddie only sees the private name, or &ldquo;a habit you&apos;re quitting&rdquo;.</span></span>
          </label>
          <button disabled={pending} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold disabled:opacity-60">Save</button>
        </form>

        {quit.kind === "limit" && quit.limitPerDay !== null && (
          <form
            action={(f) => run(() => setQuitCapAction(quit.id, Number(f.get("cap"))), (r) => CAP_LINE[r.result] ?? "Done.")}
            className="flex flex-col gap-2"
          >
            <label className="text-sm text-muted" htmlFor="quit-cap">Daily cap ({unitLabel(quit.unit, quit.limitPerDay)} a day)</label>
            <div className="flex gap-2">
              <input id="quit-cap" name="cap" type="number" inputMode="numeric" min={1} max={100000} required defaultValue={quit.limitPerDay} className={`${field} flex-1`} />
              <button disabled={pending} className="rounded-xl border border-line px-4 font-semibold">Change</button>
            </div>
            <p className="text-xs text-muted">Lowering it keeps your streak. Raising it starts a new attempt. Either way it applies from today.</p>
          </form>
        )}

        <div className="flex flex-col gap-2">
          {quit.status === "active" ? (
            <div className="flex flex-wrap gap-2">
              <button disabled={pending} onClick={() => setConfirm("paused")} className="rounded-xl border border-line px-3 py-2 text-sm">Pause</button>
              <button disabled={pending} onClick={() => setConfirm("ended")} className="rounded-xl border border-line px-3 py-2 text-sm">End</button>
            </div>
          ) : (
            <button disabled={pending} onClick={() => setStatus("active")} className="rounded-xl border border-gold px-3 py-2 text-sm font-semibold text-gold">
              {quit.status === "paused" ? "Resume" : "Start again"} (from day 0)
            </button>
          )}
          {(confirm === "paused" || confirm === "ended") && (
            <div className="rounded-xl border border-line p-3 text-sm">
              <p>{confirm === "paused" ? "A paused streak is a stopped streak: resuming starts again from day 0." : "Ending stops the count."} Your best, your total and your XP stay.</p>
              <div className="mt-2 flex gap-2">
                <button disabled={pending} onClick={() => setStatus(confirm)} className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-on-gold">{confirm === "paused" ? "Pause" : "End"}</button>
                <button onClick={() => setConfirm(null)} className="rounded-lg border border-line px-3 py-1.5 text-muted">Keep going</button>
              </div>
            </div>
          )}
          <button disabled={pending} onClick={() => setConfirm("delete")} className="self-start text-sm text-red">Delete this and its history</button>
          {confirm === "delete" && (
            <div className="rounded-xl border border-red/50 p-3 text-sm">
              <p>This deletes every log and note for it, for good. The XP it earned stays.</p>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => run(() => deleteQuitAction(quit.id), () => "Deleted.", () => router.push("/app/quits"))}
                  className="rounded-lg bg-red px-3 py-1.5 font-semibold text-white"
                >
                  Delete
                </button>
                <button onClick={() => setConfirm(null)} className="rounded-lg border border-line px-3 py-1.5 text-muted">Cancel</button>
              </div>
            </div>
          )}
        </div>
        {msg && <p className={`text-sm ${msg.error ? "text-red" : "text-muted"}`} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      </div>
    </details>
  );
}
