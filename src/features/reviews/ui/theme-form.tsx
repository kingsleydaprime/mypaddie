"use client";

import { useActionState } from "react";
import { setThemeAction, type ThemeState } from "../reviews.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function ThemeForm({ period, day, label, current }: { period: "year" | "month"; day: string; label: string; current?: { title: string; focus: string[]; notNow: string[] } }) {
  const [state, action, pending] = useActionState<ThemeState, FormData>(setThemeAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="day" value={day} />
      <input name="title" required maxLength={100} defaultValue={current?.title} placeholder={period === "month" ? "e.g. Month of Mercies" : "e.g. Year of Discipline"} aria-label={`Theme for ${label}`} className={field} />
      <textarea name="focus" rows={2} defaultValue={current?.focus.join("\n")} placeholder="Focus on — one per line" aria-label="Focus on" className={field} />
      <textarea name="notNow" rows={2} defaultValue={current?.notNow.join("\n")} placeholder="Not now — one per line" aria-label="Not now" className={field} />
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-muted" role="status">Saved.</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold disabled:opacity-60">{pending ? <span className="spinner" aria-label="Saving" /> : "Save theme"}</button>
    </form>
  );
}
