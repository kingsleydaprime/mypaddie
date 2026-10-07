import Link from "next/link";

const NAV = [
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

/** Public pages: their own header and footer, no app tab bar. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-on-gold" aria-hidden>P</span>
          MyPaddie
        </Link>
        <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hidden text-muted hover:text-text sm:inline">{n.label}</Link>
          ))}
          <Link href="/login" className="text-muted hover:text-text">Sign in</Link>
          <Link href="/signup" className="rounded-full bg-gold px-4 py-2 font-semibold text-on-gold">Get started</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-5 py-10 text-sm text-muted">
        <div className="flex flex-col justify-between gap-4 border-t border-line pt-6 sm:flex-row">
          <span>MyPaddie — a life coach for your days, habits and money.</span>
          <span className="flex flex-wrap gap-x-4 gap-y-2">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-text">{n.label}</Link>)}
            <Link href="/privacy" className="hover:text-text">Privacy</Link>
            <Link href="/terms" className="hover:text-text">Terms</Link>
            <a href="https://github.com/kingsleydaprime/mypaddie" target="_blank" rel="noopener noreferrer" className="hover:text-text">How it&apos;s built ↗</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
