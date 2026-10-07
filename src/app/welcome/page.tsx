import type { Metadata } from "next";
import { ProfileForm } from "@/features/profile/ui/profile-form";
import { requireDb } from "@/shared/supabase/session";
import { currentProfile } from "@/shared/user-context";

export const metadata: Metadata = { title: "Welcome to MyPaddie" };

/** First run: who you are, where your day is, and how Paddie should talk. Everything else can wait. */
export default async function WelcomePage() {
  await requireDb("/welcome");
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <header>
        <h1 className="text-2xl font-bold">Welcome. Let&apos;s set you up.</h1>
        <p className="mt-1 text-sm text-muted">Four things, then Paddie takes it from there. You can change any of them later in Settings.</p>
      </header>
      <ProfileForm profile={currentProfile()} onboarding />
    </main>
  );
}
