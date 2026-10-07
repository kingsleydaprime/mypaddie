import Link from "next/link";
import { requireDb } from "@/shared/supabase/session";

const CARDS = [
  { href: "/app/growth", title: "Growth", body: "Year and month themes, weekly to yearly reviews, decisions — and achievements." },
  { href: "/app/people", title: "People", body: "Who matters, what they are to you, and who you're due to check on." },
  { href: "/app/me/about", title: "About me", body: "Strengths, weak spots, patterns, triggers, habits — and what you're healing from." },
  { href: "/app/lists", title: "Lists", body: "Your bucket list, and any other list you want — ticked off, with progress." },
  { href: "/app/me/library", title: "Library", body: "Books, films, music and podcasts — and your favourite things." },
  { href: "/app/settings", title: "Who I'm becoming", body: "The person you're aiming at. Paddie coaches toward it." },
];

export default async function MePage() {
  await requireDb("/app/me");
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/quests" className="text-muted" aria-label="Back to quests">‹ Quests</Link>
        <h1 className="text-2xl font-bold">Me</h1>
      </header>
      <p className="-mt-2 text-sm text-muted">What Paddie knows about you and your people, so its advice fits. Tell Paddie in chat, or add it here.</p>
      <ul className="grid gap-3">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="block rounded-2xl border border-line bg-surface p-4">
              <p className="font-semibold">{c.title} <span className="text-gold">›</span></p>
              <p className="mt-1 text-sm text-muted">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Timetable: open a course under Quests → Courses, or send Paddie a photo of it.</p>
    </div>
  );
}
