import { safeNext } from "@/shared/safe-next";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">MyPaddie</h1>
      <form action={signIn} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input name="email" type="email" required autoComplete="email" placeholder="Email"
          className="rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password"
          className="rounded-xl border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted" />
        {params.error && <p className="text-sm text-red">Wrong email or password.</p>}
        <button className="rounded-xl bg-gold px-4 py-3.5 text-base font-semibold text-on-gold">
          Sign in
        </button>
      </form>
    </main>
  );
}
