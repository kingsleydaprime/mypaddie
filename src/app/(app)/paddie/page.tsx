import { signOut } from "@/app/login/sign-out";
import { loadActiveIdentity } from "@/features/identity/identity.repo";
import { NudgeToggle } from "@/features/push/ui/nudge-toggle";
import { loadSchedule } from "@/features/settings/settings.repo";
import { SettingsForm } from "@/features/settings/ui/settings-form";
import { requireDb } from "@/shared/supabase/session";

const CHATS = [
  { name: "Claude", href: "https://claude.ai/new" },
  { name: "ChatGPT", href: "https://chatgpt.com/" },
  { name: "Gemini", href: "https://gemini.google.com/app" },
];

/** Chat lives in the AI apps (the connector plan); this tab just gets you there. */
export default async function PaddiePage() {
  const db = await requireDb("/paddie");
  const [identity, schedule] = await Promise.all([loadActiveIdentity(db), loadSchedule(db)]);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Talk to Paddie</h1>
        <p className="mt-1 text-muted">Paddie lives in your AI app. Open one and start with &ldquo;What&apos;s today?&rdquo;</p>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Who I&apos;m becoming</h2>
        {identity ? (
          <>
            <p className="mt-1 font-semibold">{identity.name}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{identity.text}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Not written yet. Ask Paddie: &ldquo;help me write who I&apos;m becoming&rdquo;.
          </p>
        )}
      </section>
      <ul className="flex flex-col gap-3">
        {CHATS.map((c) => (
          <li key={c.name}>
            <a href={c.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-lg font-semibold">
              {c.name}
              <span className="text-muted" aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
      <NudgeToggle />
      <SettingsForm schedule={schedule} />
      <form action={signOut} className="mt-6">
        <button className="w-full rounded-xl border border-line px-4 py-3 text-muted">Sign out</button>
      </form>
    </div>
  );
}
