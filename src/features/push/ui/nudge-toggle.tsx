"use client";

import { useEffect, useState, useTransition } from "react";
import { removeSubscription, saveSubscription } from "../push.actions";

type State = "loading" | "unsupported" | "blocked" | "off" | "on";

/** The VAPID public key is base64url; PushManager wants raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function NudgeToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
        await saveSubscription(sub.toJSON());
        setState("on");
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      try {
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        if (sub) {
          await removeSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const copy: Record<State, string> = {
    loading: "Checking…",
    unsupported: "This browser can't receive nudges. On Android, install the app from Chrome first.",
    blocked: "Notifications are blocked for this site. Allow them in your browser settings, then come back.",
    off: "Nudges are off. Non-negotiables get escalating reminders until done; everything else, one check-in. Quiet 22:00–07:00.",
    on: "Nudges are on for this device. Morning brief from 08:00.",
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">Nudges</h2>
      <p className="mt-1 text-sm text-muted">{copy[state]}</p>
      {(state === "off" || state === "on") && (
        <button
          type="button"
          disabled={pending}
          onClick={state === "off" ? turnOn : turnOff}
          className={`mt-3 w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-60 ${state === "off" ? "bg-gold text-on-gold" : "border border-line"}`}
        >
          {pending ? "…" : state === "off" ? "Turn on nudges" : "Turn off"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red" role="alert">{error}</p>}
    </section>
  );
}
