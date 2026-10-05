/** One nudge as decided by the database (private.collect_nudges). */
export interface Nudge {
  kind: "nudge" | "checkin" | "brief" | "headsup";
  level: number;
  title: string | null;
  items: string[] | null;
  /** Local "HH:MM" the task is due, when it has a time. */
  due?: string | null;
}

export interface NotificationCopy {
  title: string;
  body: string;
  /** Where tapping it opens. */
  url: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag: string;
}

/**
 * Paddie's voice: firm about the action, funny about the situation. Each
 * escalation is firmer than the last; the last one points at late XP so
 * recovering still feels worth it.
 */
export function copyFor(n: Nudge): NotificationCopy {
  if (n.kind === "brief") {
    const items = n.items ?? [];
    return {
      title: "Today's three",
      body: items.length > 0 ? `${items.join(" · ")}. Pick one.` : "Nothing scheduled. Suspicious, but fine. Go live.",
      url: "/",
      tag: "brief",
    };
  }

  const task = n.title ?? "That task";
  if (n.kind === "headsup") {
    return { title: n.due ? `Coming up at ${n.due}` : "Coming up", body: `${task}. Get ready.`, url: "/", tag: `task-${task}` };
  }
  if (n.kind === "checkin") {
    return { title: task, body: "Time's passed. Did you do it?", url: "/", tag: `task-${task}` };
  }

  const escalation = [
    `${task} is due. Two minutes. Start now.`,
    `Still waiting on ${task}. The day is not getting longer.`,
    `${task}. Third call. Phone down, do it.`,
    `Last nudge for ${task} today. Late still earns XP. Go.`,
  ];
  const level = Math.min(Math.max(n.level, 1), escalation.length);
  return { title: level >= 3 ? "Paddie, again" : "Paddie", body: escalation[level - 1]!, url: "/", tag: `task-${task}` };
}
