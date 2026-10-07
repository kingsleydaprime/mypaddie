import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/features/auth/session";
import Link from "next/link";
import { normalizeCode } from "@/features/auth/auth";
import { invitesRequired } from "@/features/auth/signup-settings";
import { serverClient } from "@/shared/supabase/server";
import type { Db } from "@/shared/supabase/token-client";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Join MyPaddie" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { invite } = await searchParams;
  if (await isSignedIn()) redirect("/app");
  const inviteRequired = await invitesRequired((await serverClient()) as Db);
  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <h1 className="text-2xl font-semibold">Join MyPaddie</h1>
        <p className="text-sm text-muted">
          {inviteRequired ? "MyPaddie is invite-only for now. Your invite code is in the message you got." : "Your day, run like a game. Takes a minute."}
        </p>
      </div>
      <SignUpForm invite={typeof invite === "string" ? normalizeCode(invite) : ""} inviteRequired={inviteRequired} />
      <p className="text-xs text-muted">By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.</p>
      <p className="text-sm text-muted">Already have an account? <Link href="/login" className="text-gold underline">Sign in</Link></p>
    </>
  );
}
