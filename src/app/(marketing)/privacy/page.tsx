import type { Metadata } from "next";
import { LEGAL } from "@/shared/legal/legal";
import { Prose } from "@/shared/legal/prose";

export const metadata: Metadata = { title: "Privacy — MyPaddie" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy" updated={LEGAL.updated}>
      <p>
        MyPaddie keeps track of your day, habits, money and the people you&apos;ve made promises to. That&apos;s personal, so
        here&apos;s plainly what happens to it. MyPaddie is run by {LEGAL.company} in {LEGAL.country}.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>Your account: email, and your name if you give one.</li>
        <li>What you put in: tasks, goals, XP, money you log, notes and memories, courses, commitments, promises, fun list, events and the rest.</li>
        <li>Settings: time zone, currency, reminders, plan.</li>
        <li>If you connect Google Calendar: the events in the feed you share, read-only.</li>
        <li>If you turn on nudges: your device&apos;s push subscription.</li>
      </ul>

      <h2>What we do with it</h2>
      <p>
        Run MyPaddie for you — work out your day, XP, money stage and coaching mode, and send the nudges you asked for. That&apos;s
        all. We don&apos;t sell your data, show you ads, or use it to train AI models.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Supabase</strong> stores the database and runs sign-in.</li>
        <li><strong>Vercel</strong> hosts the app.</li>
        <li><strong>Resend</strong> sends sign-in and account emails.</li>
        <li><strong>Google</strong>, if you sign in with Google or connect your calendar.</li>
        <li>
          <strong>The AI apps you connect</strong> (Claude, ChatGPT and others) receive what they fetch from MyPaddie for your
          conversations, under their own privacy terms. You choose which ones; you can disconnect any of them in Settings.
        </li>
      </ul>
      <p>Each one only gets what it needs to do its part. Your data may be stored on servers outside {LEGAL.country}.</p>

      <h2>Who can see it</h2>
      <p>
        Only you. Every row in the database is locked to your account, and the app has no master key that can read everyone&apos;s
        data. If you ever ask us for help, we&apos;ll only look at your account with your permission.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li><strong>See and take it:</strong> Settings → Your data → Download everything.</li>
        <li><strong>Correct it:</strong> edit anything in the app, or ask Paddie to.</li>
        <li><strong>Delete it:</strong> Settings → Your data → Delete my account. It&apos;s removed immediately; backups roll over within days.</li>
        <li>
          <strong>Ask or complain:</strong> write to <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>. In Nigeria you can also
          complain to the Nigeria Data Protection Commission.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>For as long as you have an account. Delete the account and the data goes with it.</p>

      <h2>Age</h2>
      <p>MyPaddie is for people 13 and older. If you&apos;re under 18, ask a parent or guardian before signing up.</p>

      <h2>Changes</h2>
      <p>If this changes in a way that matters, we&apos;ll tell you in the app before it takes effect.</p>
    </Prose>
  );
}
