import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MyPaddie — the 3 things that matter right now",
  description:
    "Stop carrying everything in your head. Tell MyPaddie once, focus on one thing, and get reminded when something else needs you — a life coach that lives in the AI you already use.",
};

const OFFLOAD = [
  { title: "Tell it once", body: "In a sentence, in your AI chat: “I promised Ada the notes by Friday.” “Exam on the 20th.” “Training Tue and Thu, 4pm.”" },
  { title: "Then let it go", body: "Paddie holds it — the dates, the time it takes, how full your week already is. Nothing to re-read, nothing to re-plan." },
  { title: "Get reminded at the right time", body: "The night before, the morning of, half an hour out. Until then, it's off your mind and you can be fully where you are." },
];

const STEPS = [
  { n: "1", title: "Make your account", body: "A minute: your name, time zone, currency, and how you like to be talked to." },
  { n: "2", title: "Connect your AI", body: "Paste one link into Claude or ChatGPT. Paddie now knows your day, every chat." },
  { n: "3", title: "Ask “what's today?”", body: "Three things that matter, nudges on your phone, and a coach who notices when you slip." },
];

const FEATURES = [
  { title: "Three things, not thirty", body: "Today shows only what matters right now. Everything else is one tap away — never pushed at you." },
  { title: "Firm, then kind", body: "Strict when you keep slipping, soft on a rough day, and your override always wins. A reason is accepted; an excuse isn't." },
  { title: "Effort earns XP", body: "Eleven pillars, weighted XP, and late still counts. Only ignoring a need costs you." },
  { title: "Honest about money", body: "A 30-day audit, then the real gap. It'll tell you to wait 24 hours — or just no — and still reward you for logging." },
  { title: "“You've got a lot on your plate”", body: "Jobs, roles, clubs and teams, weighed against your week. Before you say yes to more, Paddie tells you what to drop." },
  { title: "Promises you keep", body: "Who you promised, what and by when. Tell them in time and nothing's lost; break it and it costs you." },
  { title: "School, sorted", body: "Your courses, topics and exams. Paddie plans study around what's coming and what's still shaky." },
  { title: "Fun counts", body: "A list of what you enjoy, suggested when you've earned a break — and a nudge when it's been too long." },
  { title: "Never overbooked", body: "A daily capacity you set, clash checks for meetings, and reminders that climb: the night before, the morning of, 30 minutes, 10." },
];

export default async function MarketingPage({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  return (
    <>
      {deleted === "1" && (
        <p className="mx-auto mt-2 max-w-5xl px-5 text-sm" role="status">
          <span className="block rounded-2xl border border-line bg-surface px-4 py-3">Your account and everything in it have been deleted. Take care.</span>
        </p>
      )}

      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-20">
        <p className="text-sm font-semibold tracking-widest text-gold uppercase">Your paddy for life</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-bold sm:text-6xl">Here are the 3 things that matter right now. Do one.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Stop carrying everything in your head. Tell MyPaddie once — the assignment, the promise, the gym, the budget, your
          mum&apos;s birthday — and give your full attention to the one thing in front of you. When something else needs you,
          you&apos;ll be reminded.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-full bg-gold px-6 py-3 font-semibold text-on-gold">Start free</Link>
          <a href="#how" className="rounded-full border border-line px-6 py-3 font-semibold">How it works</a>
        </div>
        <p className="mt-3 text-sm text-muted">Free to start. Works with Claude and ChatGPT.</p>
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

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="max-w-3xl text-2xl font-bold sm:text-3xl">You were never meant to remember all of it.</h2>
        <p className="mt-3 max-w-2xl text-muted">
          Every open loop — reply to her, submit that form, train before Saturday, don&apos;t spend the rent — sits in the back of
          your mind and costs you a little focus. Too many, and you spend the day deciding instead of doing.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {OFFLOAD.map((o) => (
            <li key={o.title} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold">{o.title}</h3>
              <p className="mt-2 text-sm text-muted">{o.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="mx-auto max-w-5xl scroll-mt-6 px-5 pb-16">
        <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-line bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold font-bold text-on-gold" aria-hidden>{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
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

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-6 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-2xl font-bold">Yours, and only yours</h2>
            <p className="mt-3 text-muted">Your life is in here — your money, your habits, the people you&apos;ve made promises to. It stays yours.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            <li><span className="text-gold">●</span> The database locks every row to your account. There&apos;s no master key that can read everyone&apos;s.</li>
            <li><span className="text-gold">●</span> Your AI signs in as you, and only sees what you could.</li>
            <li><span className="text-gold">●</span> Download everything, or delete your account, any time.</li>
            <li><span className="text-gold">●</span> No ads, no selling your data, no training AI on it.</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-gold p-6 text-on-gold sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-2xl font-bold">Start free. Upgrade when it earns it.</h2>
            <p className="mt-1 opacity-80">Free covers your day, XP, money and nudges. Plus and Pro lift the caps.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/signup" className="rounded-full bg-on-gold px-5 py-2.5 font-semibold text-gold">Get started</Link>
            <Link href="/pricing" className="rounded-full border border-current px-5 py-2.5 font-semibold">Pricing</Link>
          </div>
        </div>
      </section>
    </>
  );
}
