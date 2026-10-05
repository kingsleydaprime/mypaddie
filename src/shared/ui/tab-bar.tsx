"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", icon: "M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m0-12.8L7 7m10 10 1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" },
  { href: "/quests", label: "Quests", icon: "M5 4h14M5 9h14M5 14h9M5 19h6" },
  { href: "/money", label: "Money", icon: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" },
  { href: "/stats", label: "Stats", icon: "M5 20V10m7 10V4m7 16v-7" },
  { href: "/paddie", label: "Paddie", icon: "M4 5h16v11H8l-4 4V5Z" },
] as const;

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-gold" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
