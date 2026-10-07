import { signOut } from "@/app/login/sign-out";
import { calendarStatus } from "@/features/calendar/calendar.repo";
import { CalendarSettings } from "@/features/calendar/ui/calendar-settings";
import { listIdentities } from "@/features/identity/identity.repo";
import { ProfileEditor } from "@/features/identity/ui/profile-editor";
import { NudgeToggle } from "@/features/push/ui/nudge-toggle";
import { loadSchedule } from "@/features/settings/settings.repo";
import { SettingsForm } from "@/features/settings/ui/settings-form";
import { ProfileForm } from "@/features/profile/ui/profile-form";
import { requireDb } from "@/shared/supabase/session";
import { currentProfile } from "@/shared/user-context";

const CHATS = [
  { name: "Claude", href: "https://claude.ai/new" },
  { name: "ChatGPT", href: "https://chatgpt.com/" },
  { name: "Gemini", href: "https://gemini.google.com/app" },
];

export default async function SettingsPage() {
  const db = await requireDb("/app/settings");
  const [versions, schedule, calendar, claims] = await Promise.all([listIdentities(db), loadSchedule(db), calendarStatus(db), db.auth.getClaims()]);
  const email = claims.data?.claims.email;
  const profile = currentProfile();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        {email && <p className="text-sm text-muted">Signed in as {email}</p>}
      </header>

      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-bold">You</summary>
        <p className="mt-1 text-sm text-muted">{[profile.displayName, profile.timeZone, profile.currency, profile.voice === "naija" ? "Naija banter" : "plain English"].filter(Boolean).join(" · ")}</p>
        <div className="mt-3"><ProfileForm profile={profile} /></div>
      </details>
      <ProfileEditor versions={versions} />
      <NudgeToggle />
      <SettingsForm schedule={schedule} />
      <CalendarSettings status={calendar} />

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Talk to Paddie</h2>
        <p className="-mt-1 text-sm text-muted">Paddie lives in your AI app. Open one and start with &ldquo;What&apos;s today?&rdquo;</p>
        <div className="grid grid-cols-3 gap-2">
          {CHATS.map((c) => (
            <a key={c.name} href={c.href} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line bg-surface px-2 py-3 text-center text-sm font-semibold">
              {c.name} <span className="text-muted" aria-hidden>↗</span>
            </a>
          ))}
        </div>
      </section>

      <form action={signOut}>
        <button className="w-full rounded-xl border border-line px-4 py-3 text-muted">Sign out</button>
      </form>
    </div>
  );
}
