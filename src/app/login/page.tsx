import Link from "next/link";
import { redirect } from "next/navigation";
import { loginErrorText, normalizeCode } from "@/features/auth/auth";
import { safeNext } from "@/shared/safe-next";
import { signIn, signInWithGoogle } from "./actions";
import { ResetPasswordForm, SignInLinkForm } from "./link-forms";

const field = "rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  // Shared invite links point here; send them to sign-up with the code filled in.
  const invite = one(params.invite);
  if (invite) redirect(`/signup?invite=${encodeURIComponent(normalizeCode(invite))}`);
  const next = safeNext(params.next);
  const error = loginErrorText(one(params.error), one(params.message));

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-2xl font-bold text-on-gold" aria-hidden>P</span>
        <h1 className="text-2xl font-semibold">Sign in to MyPaddie</h1>
      </div>
      {error && <p className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm" role="alert">{error}</p>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 font-semibold">
          <span aria-hidden className="font-bold">G</span> Continue with Google
        </button>
      </form>

      <SignInLinkForm next={next} />

      <details className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">Sign in with a password</summary>
        <form action={signIn} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" className={field} />
          <button className="rounded-xl border border-gold px-4 py-3.5 font-semibold text-gold">Sign in</button>
        </form>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Forgot your password?</summary>
          <div className="mt-2"><ResetPasswordForm /></div>
        </details>
      </details>

      <p className="text-sm text-muted">Got an invite? <Link href="/signup" className="text-gold underline">Create your account</Link></p>
      <Link href="/" className="text-sm text-muted">← Back to home</Link>
    </main>
  );
}
