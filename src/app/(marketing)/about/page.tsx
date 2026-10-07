import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/shared/legal/legal";

export const metadata: Metadata = {
  title: "About — MyPaddie",
  description: "Why MyPaddie exists, what it believes, and who's behind it.",
};

const PRINCIPLES = [
  { title: "Reduce decision fatigue", body: "Not another life to manage. Paddie opens with three things and asks you to do one. The numbers are there when you go looking, never pushed at you." },
  { title: "Person first", body: "You're a person, not a job title. Student, engineer, striker, choir member — those are just things on your calendar." },
  { title: "You define who you're becoming", body: "You write it; Paddie coaches toward it and never lectures you about whether it's the right one." },
  { title: "Firm about the action, funny about the situation", body: "The joke never replaces the instruction. And when you're genuinely struggling, the jokes stop." },
  { title: "Effort earns", body: "Trying and failing still scores. Only ignoring what you can't live without costs you — and late still beats never." },
  { title: "Honest over agreeable", body: "It's allowed to say no — including “don't buy this” and “you've got too much on already”." },
  { title: "You stay in control", body: "Plans, money splits and study weeks are proposals. You accept, tweak or say no." },
  { title: "Your data stays yours", body: "Locked to your account by the database itself, downloadable in one file, deletable in one step." },
];

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-5 pt-10 pb-12 sm:pt-16">
        <h1 className="text-4xl font-bold sm:text-5xl">A paddy who won&apos;t let you slack.</h1>
        <div className="mt-6 flex flex-col gap-4 text-lg text-muted">
          <p>
            Most productivity apps hand you a longer list. MyPaddie does the opposite: it carries the list so you don&apos;t have to,
            and tells you the three things that matter right now.
          </p>
          <p>
            In Nigeria a <em>paddy</em> is a close friend — the one who checks on you, tells you the truth, and drags you out of the
            house when you&apos;ve been in too long. That&apos;s the idea: a friend with a big-brother streak, who also happens to
            know your deadlines, your budget and every promise you&apos;ve made.
          </p>
          <p>
            It lives in the AI you already talk to, so there&apos;s no new habit to build — you ask &ldquo;what&apos;s today?&rdquo; and it
            knows.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-2xl font-bold sm:text-3xl">What it believes</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-20">
        <h2 className="text-2xl font-bold">Who&apos;s behind it</h2>
        <p className="mt-3 text-muted">
          MyPaddie is built in {LEGAL.country} by {LEGAL.company}. The code is open:{" "}
          <a href="https://github.com/kingsleydaprime/mypaddie" target="_blank" rel="noopener noreferrer" className="text-gold underline">see how it&apos;s built</a>
          , including every decision and why. Questions or ideas:{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-gold underline">{LEGAL.contact}</a>.
        </p>
        <Link href="/signup" className="mt-6 inline-block rounded-full bg-gold px-6 py-3 font-semibold text-on-gold">Meet your paddy</Link>
      </section>
    </>
  );
}
