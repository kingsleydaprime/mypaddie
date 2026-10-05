/** One nudge as decided by the database (private.collect_nudges). */
export interface Nudge {
  kind: "nudge" | "checkin" | "brief" | "headsup" | "reminder" | "event" | "application";
  level: number;
  title: string | null;
  items: string[] | null;
  /** Local "HH:MM" the task is due, when it has a time. */
  due?: string | null;
  /** Events only. */
  eventKind?: string | null;
  person?: string | null;
  /** Days until the event (for the week heads-up). */
  days?: number | null;
  /** His own words for this task/event, if he set any. */
  note?: string | null;
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
  const base = defaultCopy(n);
  const note = n.note?.trim();
  if (!note || n.kind === "brief") return base;
  // Escalations keep Paddie's firm line and add the note; everything else says it in his words.
  return { ...base, body: n.kind === "nudge" ? `${base.body}\n${note}` : note };
}

function defaultCopy(n: Nudge): NotificationCopy {
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
  if (n.kind === "application") {
    const missing = n.items ?? [];
    const still = missing.length ? `Still missing: ${missing.join(", ")}.` : "Everything's ready — submit early.";
    const closes = n.due ? ` Closes ${n.due} your time.` : "";
    const tag = `application-${task}`;
    if (n.level === 6) return { title: task, body: "Rolling deadline — places go to early applicants. Apply soon.", url: "/applications", tag };
    if (n.level === 7) return { title: task, body: "Results are due around now. Check your email and the portal.", url: "/applications", tag };
    const when = n.level === 5 ? "Your target is today" : `${n.days ?? "A few"} days to your target`;
    return { title: `${task}: ${when}`, body: `${still}${closes}`, url: "/applications", tag };
  }
  if (n.kind === "event") {
    const celebrates = n.eventKind === "birthday" || n.eventKind === "anniversary";
    const who = n.person ?? task;
    const at = n.due ? ` at ${n.due}` : "";
    const tag = `event-${task}`;
    switch (n.level) {
      case 1:
        return { title: `In ${n.days ?? "a few"} days`, body: celebrates ? `${task}. Sort a gift or a plan now, not the night before.` : `${task}${at}. Anything to prepare?`, url: "/", tag };
      case 2:
        return { title: `Tomorrow${at}`, body: celebrates ? `${task} is tomorrow.` : `${task}. Get what you need ready tonight.`, url: "/", tag };
      case 3:
        return celebrates
          ? { title: n.eventKind === "birthday" ? `It's ${who}'s birthday` : `${task} today`, body: "Call or text. A voice note counts.", url: "/", tag }
          : { title: `Today${at}`, body: `${task}. Plan the day around it.`, url: "/", tag };
      default:
        return { title: "In 30 minutes", body: `${task}${at}. Time to move.`, url: "/", tag };
    }
  }
  if (n.kind === "reminder") {
    // Level = which rung of the ladder: 1 evening before, 2 morning of, 3 in 30 min, 4 in 10 min.
    const at = n.due ? ` at ${n.due}` : "";
    const ladder: [string, string][] = [
      [`Tomorrow${at}`, `${task}. Sort what you need tonight.`],
      [`Today${at}`, `${task}. Plan the day around it.`],
      ["In 30 minutes", `${task}${at}. Start wrapping up.`],
      ["In 10 minutes", `${task}. Go.`],
    ];
    const [title, body] = ladder[Math.min(Math.max(n.level, 1), 4) - 1]!;
    return { title, body, url: "/", tag: `task-${task}` };
  }
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
