import Link from "next/link";

/** Public pages: their own header and footer, no app tab bar. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-on-gold" aria-hidden>P</span>
          MyPaddie
        </Link>
        <Link href="/app" className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-on-gold">Open app</Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-5 py-10 text-sm text-muted">
        <div className="flex flex-col justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <span>MyPaddie — a private life coach for your days, habits and money.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-text">Privacy</Link>
            <Link href="/terms" className="hover:text-text">Terms</Link>
            <a href="https://github.com/kingsleydaprime/mypaddie" target="_blank" rel="noopener noreferrer" className="hover:text-text">How it&apos;s built ↗</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
