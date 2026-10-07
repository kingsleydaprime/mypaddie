"use client";

import { useActionState, useEffect, useState } from "react";
import type { Profile } from "../profile";
import { finishOnboardingAction, saveProfileAction, type ProfileFormState } from "../profile.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";
const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "EGP", "XOF", "XAF", "UGX", "TZS", "RWF", "GBP", "EUR", "USD", "CAD"];
const supported = (kind: "timeZone" | "currency"): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(kind);
  } catch {
    return [];
  }
};

/** Name, time zone, currency and voice. `onboarding` = first run: suggests this device's zone and finishes setup. */
export function ProfileForm({ profile, onboarding = false }: { profile: Profile; onboarding?: boolean }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(onboarding ? finishOnboardingAction : saveProfileAction, null);
  const [zone, setZone] = useState(profile.timeZone);
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values, read after mount
    setZones(supported("timeZone"));
    if (onboarding && !profile.onboardedAt) {
      const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (here) setZone(here);
    }
  }, [onboarding, profile.onboardedAt]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">What should Paddie call you?</span>
        <input name="displayName" maxLength={60} defaultValue={profile.displayName ?? ""} placeholder="Your first name" className={field} autoComplete="given-name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Time zone — your days, reminders and quiet hours follow it</span>
        <input name="timeZone" list="zones" required value={zone} onChange={(e) => setZone(e.target.value)} className={field} />
        <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Currency</span>
        <input name="currency" list="currencies" required defaultValue={profile.currency} maxLength={3} className={`${field} uppercase`} />
        <datalist id="currencies">{[...new Set([...CURRENCIES, ...supported("currency")])].map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-muted">How should Paddie talk to you?</legend>
        {([
          ["naija", "Naija banter", "Deadpan narrator, big-brother energy, a little pidgin."],
          ["neutral", "Plain English", "Same firm-but-funny coach, no slang."],
        ] as const).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-gold">
            <input type="radio" name="voice" value={value} defaultChecked={profile.voice === value} className="mt-1 accent-[var(--gold)]" />
            <span><span className="font-semibold">{label}</span><br /><span className="text-muted">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-muted" role="status">Saved.</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-3 font-semibold text-on-gold disabled:opacity-60">
        {pending ? "Saving…" : onboarding ? "Let's go" : "Save"}
      </button>
    </form>
  );
}
