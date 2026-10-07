import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/shared/legal/legal";
import { Prose } from "@/shared/legal/prose";

export const metadata: Metadata = { title: "Terms — MyPaddie" };

export default function TermsPage() {
  return (
    <Prose title="Terms" updated={LEGAL.updated}>
      <p>
        These are the rules for using MyPaddie, run by {LEGAL.company} in {LEGAL.country}. By creating an account you agree to them
        and to our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>What MyPaddie is — and isn&apos;t</h2>
      <p>
        A coach for your days, habits and money. It is not financial, medical, legal or mental-health advice, and the AI apps you
        connect to it can be wrong. Decisions are yours. If you&apos;re in crisis or thinking of harming yourself, contact local
        emergency services or someone you trust — don&apos;t rely on an app.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in safe; you&apos;re responsible for what happens in your account.</li>
        <li>Only connect AI apps you trust. Anything you allow can read and change your MyPaddie data until you disconnect it.</li>
        <li>You can download your data or delete your account at any time in Settings.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Don&apos;t use MyPaddie to break the law, harm others, or overload or attack the service. Requests are rate-limited. We may
        suspend accounts that abuse it.
      </p>

      <h2>Plans and prices</h2>
      <p>
        MyPaddie has Free, Plus and Pro plans. During early access nothing is charged. Before we start charging we&apos;ll tell you,
        and nothing paid starts without you choosing it. Prices may change with notice; a change never applies to a period
        you&apos;ve already paid for.
      </p>

      <h2>The service</h2>
      <p>
        We work to keep MyPaddie running and your data safe, but it&apos;s provided as it is, without guarantees that it will always
        be available or error-free. To the extent the law allows, we aren&apos;t liable for indirect losses, and our total liability
        is limited to what you paid us in the last 12 months.
      </p>

      <h2>Ending</h2>
      <p>You can stop any time by deleting your account. We may close MyPaddie or your account with reasonable notice, and you&apos;ll be able to download your data first.</p>

      <h2>Law and contact</h2>
      <p>
        These terms are governed by the laws of {LEGAL.country}. Questions: <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>.
      </p>
    </Prose>
  );
}
