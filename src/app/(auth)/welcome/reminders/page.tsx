import type { Metadata } from "next";
import { InstallHint } from "@/features/onboarding/install-hint";
import { Step } from "@/features/onboarding/steps";
import { NudgeToggle } from "@/features/push/ui/nudge-toggle";
import { requireDb } from "@/shared/supabase/session";

export const metadata: Metadata = { title: "Reminders — MyPaddie" };

export default async function RemindersStep() {
  await requireDb("/welcome/reminders");
  return (
    <Step n={3} title="Let Paddie remind you" next="/welcome/start" skip="/welcome/start">
      <p className="text-muted">
        This is what lets you stop holding everything in your head: when something needs you — a deadline, a class, a promise —
        your phone tells you. Nothing during your quiet hours.
      </p>
      <InstallHint />
      <NudgeToggle />
      <p className="text-xs text-muted">Do this on your phone — reminders arrive on the device that turns them on.</p>
    </Step>
  );
}
