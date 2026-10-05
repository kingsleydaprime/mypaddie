import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MyPaddie — the 3 things that matter right now",
  description: "A private life coach that runs your day like a game and keeps you honest about your time, habits and money.",
};

const FEATURES = [
  { title: "Three things, not thirty", body: "Today shows only what matters right now. Everything else is one tap away — never pushed at you." },
  { title: "Firm, then kind", body: "Strict when you keep slipping, soft on a rough day, and your override always wins. A reason is accepted; an excuse isn't." },
  { title: "Effort earns XP", body: "Eleven pillars, weighted XP, late still counts. Only ignoring a need costs you." },
  { title: "Honest about money", body: "A 30-day audit, then the real gap. It tells you to wait 24 hours, or simply no — and still rewards you for logging." },
  { title: "Never overbooked", body: "A daily capacity you set, clash checks for meetings, and reminders that climb: the night before, the morning of, 30 minutes, 10." },
  { title: "Deadlines that don't lie", body: "Applications keep their own time zone, so '23:59 EST' never quietly becomes a deadline you've already missed." },
];

export default function MarketingPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-gold">A private life coach</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-bold sm:text-6xl">Here are the 3 things that matter right now. Do one.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          MyPaddie runs your day like a game, knows when to be strict or soft, and keeps you honest about your time, habits and money.
          Talk to it in Claude, ChatGPT or Gemini; glance at it on your phone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/app" className="rounded-full bg-gold px-6 py-3 font-semibold text-on-gold">Open MyPaddie</Link>
          <a href="#how" className="rounded-full border border-line px-6 py-3 font-semibold">How it works</a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <p className="text-sm text-muted">Quest log, 07:40</p>
          <p className="mt-2 text-xl leading-relaxed sm:text-2xl">
            &ldquo;Hero woke up, opened phone within 4 minutes, and is now 40 minutes into a video about a man restoring a rusty knife.
            The knife is looking great. Your morning reading is not. <span className="text-gold">Put the phone down.</span>&rdquo;
          </p>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl scroll-mt-6 px-5 pb-16">
        <h2 className="text-2xl font-bold sm:text-3xl">What it does</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="grid gap-6 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-2xl font-bold">Yours, and only yours</h2>
            <p className="mt-3 text-muted">Built for one person. Your data lives in your own database and exports in one call.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            <li><span className="text-gold">●</span> The AI signs in as you — every query is limited to your rows by the database itself.</li>
            <li><span className="text-gold">●</span> No admin key exists anywhere in the app.</li>
            <li><span className="text-gold">●</span> Works with any AI that speaks MCP: Claude, ChatGPT, Gemini.</li>
            <li><span className="text-gold">●</span> Read-only calendar import; nothing is ever sent anywhere else.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
