import Link from "next/link";

/**
 * Signing in, joining, first-run setup and connecting an AI app: one quiet
 * centred column, the mark to get home, and the legal links.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
      <Link href="/" className="flex items-center gap-2 self-start font-bold" aria-label="MyPaddie home">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-lg text-on-gold" aria-hidden>P</span>
        MyPaddie
      </Link>
      <main className="flex flex-1 flex-col justify-center gap-6 py-8">{children}</main>
      <footer className="flex gap-4 text-xs text-muted">
        <Link href="/privacy" className="hover:text-text">Privacy</Link>
        <Link href="/terms" className="hover:text-text">Terms</Link>
      </footer>
    </div>
  );
}
