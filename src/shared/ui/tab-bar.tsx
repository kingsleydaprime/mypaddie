"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const SIDE: [Tab, Tab, Tab, Tab] = [
  { href: "/app/quests", label: "Quests", icon: "M5 4h14M5 9h14M5 14h9M5 19h6" },
  { href: "/app/money", label: "Money", icon: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" },
  { href: "/app/stats", label: "Stats", icon: "M5 20V10m7 10V4m7 16v-7" },
  {
    href: "/app/settings",
    label: "Settings",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  },
];
const HOME_ICON = "M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5";

/** Screens reached from Today count as "home" for the highlighted tab. */
const HOME_PATHS = ["/app/plan", "/app/events", "/app/workout", "/app/tasks"];

function Icon({ d, className }: { d: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function SideTab({ tab, path }: { tab: Tab; path: string }) {
  const active = path === tab.href || path.startsWith(`${tab.href}/`) || (tab.href === "/app/quests" && (path.startsWith("/app/applications") || path.startsWith("/app/updates"))) || (tab.href === "/app/money" && path.startsWith("/app/pantry"));
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium ${active ? "text-gold" : "text-muted"}`}
    >
      <Icon d={tab.icon} className="h-6 w-6" />
      {tab.label}
    </Link>
  );
}

export function TabBar() {
  const path = usePathname();
  const homeActive = path === "/app" || HOME_PATHS.some((p) => path.startsWith(p));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
      <div className="mx-auto flex max-w-md items-end">
        <SideTab tab={SIDE[0]} path={path} />
        <SideTab tab={SIDE[1]} path={path} />
        <div className="flex flex-1 justify-center">
          {/* Home: raised above the bar, always gold. */}
          <Link
            href="/app"
            aria-label="Today"
            aria-current={homeActive ? "page" : undefined}
            className={`-mt-6 mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gold text-on-gold shadow-lg ring-4 ring-bg transition-transform active:scale-95 ${homeActive ? "" : "opacity-90"}`}
          >
            <Icon d={HOME_ICON} className="h-7 w-7" />
          </Link>
        </div>
        <SideTab tab={SIDE[2]} path={path} />
        <SideTab tab={SIDE[3]} path={path} />
      </div>
    </nav>
  );
}
