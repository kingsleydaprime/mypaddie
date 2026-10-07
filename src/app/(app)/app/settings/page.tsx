import { signOut } from "@/app/login/sign-out";
import { calendarStatus } from "@/features/calendar/calendar.repo";
import { CalendarSettings } from "@/features/calendar/ui/calendar-settings";
import { listIdentities } from "@/features/identity/identity.repo";
import { ProfileEditor } from "@/features/identity/ui/profile-editor";
import { NudgeToggle } from "@/features/push/ui/nudge-toggle";
import { loadSchedule } from "@/features/settings/settings.repo";
import { SettingsForm } from "@/features/settings/ui/settings-form";
import { loadConnectedApps } from "@/features/connect/connect.repo";
import { ConnectPanel } from "@/features/connect/ui/connect-panel";
import { loadInvites } from "@/features/invites/invites.repo";
import { InvitePanel } from "@/features/invites/ui/invite-panel";
import { ProfileForm } from "@/features/profile/ui/profile-form";
import { siteOrigin } from "@/shared/site";
import { requireDb } from "@/shared/supabase/session";
import { currentProfile } from "@/shared/user-context";

export default async function SettingsPage() {
  const db = await requireDb("/app/settings");
  const [versions, schedule, calendar, claims, invites, apps] = await Promise.all([listIdentities(db), loadSchedule(db), calendarStatus(db), db.auth.getClaims(), loadInvites(db, new Date()), loadConnectedApps(db)]);
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
      {(invites.left > 0 || invites.invites.length > 0) && <InvitePanel invites={invites.invites} left={invites.left} />}

      <ConnectPanel mcpUrl={`${await siteOrigin()}/api/mcp`} apps={apps} />

      <form action={signOut}>
        <button className="w-full rounded-xl border border-line px-4 py-3 text-muted">Sign out</button>
      </form>
    </div>
  );
}
