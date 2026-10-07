import type { Metadata } from "next";
import { CopyButton } from "@/features/connect/ui/copy-button";
import { Step } from "@/features/onboarding/steps";
import { requireDb } from "@/shared/supabase/session";

export const metadata: Metadata = { title: "Start — MyPaddie" };

const PROMPTS = [
  "Here's what's on my mind this week: …",
  "Here's my school timetable (photo attached). Set it up.",
  "I promised Ada I'd send her the notes by Friday.",
  "I want to read every morning and go to the gym Tue and Thu at 6pm.",
  "What's today?",
];

export default async function StartStep() {
  await requireDb("/welcome/start");
  return (
    <Step n={4} title="Empty your head" next="/app" nextLabel="Go to Today">
      <p className="text-muted">
        Open your AI app and tell Paddie what you&apos;re carrying — deadlines, promises, classes, habits, people. Say it once; it
        remembers and reminds you. A few ways to start:
      </p>
      <ul className="flex flex-col gap-2">
        {PROMPTS.map((p) => (
          <li key={p} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-3 text-sm">
            <span className="min-w-0 flex-1">&ldquo;{p}&rdquo;</span>
            <CopyButton text={p} />
          </li>
        ))}
      </ul>
    </Step>
  );
}
