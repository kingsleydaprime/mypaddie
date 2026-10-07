import type { Metadata } from "next";
import Link from "next/link";
import { PricingTable } from "@/features/plans/ui/pricing-table";

export const metadata: Metadata = {
  title: "Pricing — MyPaddie",
  description: "Free to start. Plus and Pro lift the caps and add study plans, weekly load advice and Google Calendar import. Half price for students.",
};

const FAQ = [
  { q: "Is it really free right now?", a: "Yes. During early access nothing is charged — pick any plan in Settings → Plan. We'll tell you well before that changes, and nothing paid starts without you choosing it." },
  { q: "What stays free for good?", a: "Your day, XP, money, nudges, one connected AI app, and your data: download it or delete your account whenever you like." },
  { q: "Do I need Claude or ChatGPT?", a: "Paddie talks to you through the AI app you already use. Claude and ChatGPT can both add it as a custom connector, free plans included. The MyPaddie phone app works on its own too." },
  { q: "Students?", a: "Half price on Plus and Pro. Pick “I'm a student” when you choose a plan." },
  { q: "Can I change or cancel?", a: "Any time, in Settings → Plan. Going down to Free never deletes anything — you just can't add past the caps." },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-10 sm:pt-16">
        <h1 className="text-4xl font-bold sm:text-5xl">Start free. Upgrade when it earns it.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Free runs your day. Plus is for a full life — no caps, study plans, weekly load advice, your Google Calendar. Pro adds
          any number of AI apps, and Paddie&apos;s own chat when it lands.
        </p>
        <p className="mt-4 inline-block rounded-2xl border border-gold bg-surface px-4 py-2 text-sm">
          <span className="font-semibold">Early access:</span> every plan is free right now.
        </p>
      </section>
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <PricingTable />
        <p className="mt-4 text-sm text-muted">Students pay half. Prices in naira for Nigeria, dollars elsewhere.</p>
      </section>
      <section className="mx-auto max-w-3xl px-5 pb-20">
        <h2 className="text-2xl font-bold">Questions</h2>
        <dl className="mt-4 flex flex-col divide-y divide-line">
          {FAQ.map((f) => (
            <div key={f.q} className="py-4">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
        <Link href="/signup" className="mt-6 inline-block rounded-full bg-gold px-6 py-3 font-semibold text-on-gold">Get started</Link>
      </section>
    </>
  );
}
