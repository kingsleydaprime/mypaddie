import Link from "next/link";

type Entry = { href: string; label: string; hint: string };

/** Everything that isn't a tab, grouped by what it's for. */
const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "Plans & promises",
    entries: [
      { href: "/app/quests", label: "Life list", hint: "Needs, wants, goals, wishes, dreams" },
      { href: "/app/commitments", label: "Commitments", hint: "Jobs and roles" },
      { href: "/app/promises", label: "Promises", hint: "What you said you'd do" },
      { href: "/app/events", label: "Events", hint: "What's coming up" },
    ],
  },
  {
    title: "You",
    entries: [
      { href: "/app/me", label: "Me & people", hint: "About me, values, library, lists, people" },
      { href: "/app/growth", label: "Growth", hint: "Reviews, themes, achievements" },
    ],
  },
  {
    title: "Progress",
    entries: [
      { href: "/app/stats", label: "Stats", hint: "XP, streaks, pillars" },
      { href: "/app/stats/trends", label: "Trends", hint: "Sleep, mood, screen time, spending" },
      { href: "/app/life", label: "Your life", hint: "Every pillar at a glance" },
    ],
  },
  {
    title: "Study & work",
    entries: [
      { href: "/app/courses", label: "Courses", hint: "Courses and timetables" },
      { href: "/app/applications", label: "Applications", hint: "Jobs, schools, grants" },
      { href: "/app/updates", label: "Updates", hint: "Updates you owe people" },
    ],
  },
  {
    title: "Body & fun",
    entries: [
      { href: "/app/workout", label: "Workout", hint: "Today's session and your plan" },
      { href: "/app/fun", label: "Fun list", hint: "Things you enjoy" },
    ],
  },
];

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Others</h1>
      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">{g.title}</h2>
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            {g.entries.map((e) => (
              <li key={e.href} className="border-b border-line last:border-b-0">
                <Link href={e.href} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{e.label}</span>
                    <span className="block truncate text-sm text-muted">{e.hint}</span>
                  </span>
                  <span className="text-muted" aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
