import { signOut } from "@/features/auth/sign-out";
import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
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
import { YourData } from "@/features/account/ui/your-data";
import { ProfileForm } from "@/features/profile/ui/profile-form";
import { siteOrigin } from "@/shared/site";
import { requireDb } from "@/shared/supabase/session";
import Link from "next/link";
import { PLAN_INFO } from "@/features/plans/plans";
import { currentPlan, currentProfile } from "@/shared/user-context";

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
      <Link href="/app/billing" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
        <span><span className="font-bold">Plan</span> <span className="text-sm text-muted">· {PLAN_INFO[currentPlan().plan].name}</span></span>
        <span className="text-sm text-gold">Change ›</span>
      </Link>
      <ProfileEditor versions={versions} />
      <NudgeToggle />
      <SettingsForm schedule={schedule} />
      <CalendarSettings status={calendar} />
      {(invites.left > 0 || invites.invites.length > 0) && <InvitePanel invites={invites.invites} left={invites.left} />}

      <ConnectPanel mcpUrl={`${await siteOrigin()}/api/mcp`} apps={apps} />

      <FeedbackForm />
      <YourData />

      <form action={signOut}>
        <button className="w-full rounded-xl border border-line px-4 py-3 text-muted">Sign out</button>
      </form>
    </div>
  );
}
