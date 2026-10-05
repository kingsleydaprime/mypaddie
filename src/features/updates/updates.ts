export const CHANNELS = ["email", "whatsapp", "slack", "spreadsheet", "call", "meeting", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Update tasks are titled like this — and left out of the digest (sending an update isn't news). */
export const UPDATE_TASK_PREFIX = "Update: ";

const DAY = 86_400_000;

/** Where the next draft starts: the last one sent, or (never sent) the last 7 days. */
export function draftSince(lastSentAt: Date | null, now: Date, fallbackDays = 7): Date {
  return lastSentAt ?? new Date(now.getTime() - fallbackDays * DAY);
}

export interface Activity {
  tasks: { title: string; doneAt: Date }[];
  learning: { skill: string; topic: string | null; minutes: number }[];
  workouts: { at: Date; minutes: number | null }[];
  applications: { title: string; status: string; at: Date }[];
}

export interface Digest {
  completed: string[];
  learning: { skill: string; minutes: number; topics: string[] }[];
  workouts: { sessions: number; minutes: number };
  applications: string[];
  isEmpty: boolean;
}

/**
 * The raw material for a draft, grouped and deduplicated. The AI decides what
 * fits the update's topic; this never invents anything — an empty digest
 * means "say so honestly", not "make something up".
 */
export function buildDigest(a: Activity): Digest {
  const completed = [...new Set(a.tasks.filter((t) => !t.title.startsWith(UPDATE_TASK_PREFIX)).sort((x, y) => x.doneAt.getTime() - y.doneAt.getTime()).map((t) => t.title))];

  const bySkill = new Map<string, { minutes: number; topics: Set<string> }>();
  for (const l of a.learning) {
    const entry = bySkill.get(l.skill) ?? { minutes: 0, topics: new Set<string>() };
    entry.minutes += l.minutes;
    if (l.topic?.trim()) entry.topics.add(l.topic.trim());
    bySkill.set(l.skill, entry);
  }
  const learning = [...bySkill]
    .map(([skill, v]) => ({ skill, minutes: v.minutes, topics: [...v.topics] }))
    .sort((x, y) => y.minutes - x.minutes);

  const workouts = { sessions: a.workouts.length, minutes: a.workouts.reduce((s, w) => s + (w.minutes ?? 0), 0) };
  const applications = a.applications.map((x) => `${x.title}: ${x.status}`);
  return { completed, learning, workouts, applications, isEmpty: !completed.length && !learning.length && !workouts.sessions && !applications.length };
}
