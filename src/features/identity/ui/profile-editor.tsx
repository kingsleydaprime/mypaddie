"use client";

import { useActionState } from "react";
import { saveProfileAction, switchProfileAction, type ProfileState } from "../identity.actions";

interface Version {
  id: string;
  name: string;
  text: string;
  is_active: boolean;
}

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

/** "Who I'm becoming" — written by him. The AI reads it every chat; it doesn't get the last word. */
export function ProfileEditor({ versions }: { versions: Version[] }) {
  const active = versions.find((v) => v.is_active) ?? null;
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, null);
  const others = versions.filter((v) => !v.is_active);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-bold">Who I&apos;m becoming</h2>
        <p className="text-sm text-muted">In your words. Paddie measures your choices against this — and never argues with it.</p>
      </div>
      <form action={action} className="flex flex-col gap-3" key={active?.id ?? "new"}>
        <input type="hidden" name="id" value={active?.id ?? ""} />
        <input name="name" defaultValue={active?.name ?? ""} placeholder="Name this version, e.g. 2026: steady and sharp" required className={field} />
        <textarea
          name="text"
          defaultValue={active?.text ?? ""}
          rows={8}
          required
          placeholder={"How he walks into a room and how he talks…\nWhat he always does, and never does…\nWhat he says no to…\nHow he treats money, people and his time…"}
          className={`${field} leading-relaxed`}
        />
        {state && <p className={`text-sm ${"error" in state ? "text-red" : "text-green"}`} role={"error" in state ? "alert" : "status"}>{"error" in state ? state.error : state.ok}</p>}
        <div className="flex gap-2">
          <button name="mode" value="edit" disabled={pending} className="flex-1 rounded-xl bg-gold px-3 py-3 font-semibold text-on-gold disabled:opacity-60">
            {active ? "Save" : "Save profile"}
          </button>
          {active && (
            <button name="mode" value="new" disabled={pending} className="rounded-xl border border-line px-3 py-3 text-sm">
              Save as new version
            </button>
          )}
        </div>
      </form>
      {others.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="text-sm text-muted">Other versions</p>
          {others.map((v) => (
            <form key={v.id} action={switchProfileAction.bind(null, v.id)} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{v.name}</span>
              <button className="shrink-0 text-sm font-medium text-gold">Use this</button>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
