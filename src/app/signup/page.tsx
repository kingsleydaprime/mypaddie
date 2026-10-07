import type { Metadata } from "next";
import Link from "next/link";
import { normalizeCode } from "@/features/auth/auth";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Join MyPaddie" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { invite } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-2xl font-bold text-on-gold" aria-hidden>P</span>
        <h1 className="text-2xl font-semibold">Join MyPaddie</h1>
        <p className="text-sm text-muted">MyPaddie is invite-only for now. Your invite code is in the message you got.</p>
      </div>
      <SignUpForm invite={typeof invite === "string" ? normalizeCode(invite) : ""} />
      <p className="text-sm text-muted">Already have an account? <Link href="/login" className="text-gold underline">Sign in</Link></p>
    </main>
  );
}
