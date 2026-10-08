/** One nudge as decided by the database (private.collect_nudges). */
export interface Nudge {
  kind: "nudge" | "checkin" | "brief" | "headsup" | "reminder" | "event" | "application" | "fun" | "review" | "close_out" | "leave";
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
  /** Close-out only: the day in numbers; `tomorrow` = how many things are on tomorrow (items holds the first three). */
  summary?: { done: number; slipped: number; xp: number; tomorrow: number } | null;
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
      url: "/app",
      tag: "brief",
    };
  }

  if (n.kind === "leave") {
    return {
      title: `Time to head out${n.due ? ` — ${n.title ?? "next thing"} at ${n.due}` : ""}`,
      body: `${n.title ?? "Your next thing"} starts soon. Say your goodbyes now; the good ones understand.`,
      url: "/app",
      tag: `leave-${n.title ?? ""}`,
    };
  }
  if (n.kind === "close_out") {
    // Level carries how many things are still open.
    const open = n.level;
    const s = n.summary;
    if (s) {
      const day = [`${s.done} done`, s.slipped ? `${s.slipped} slipped` : null, open ? `${open} open` : null].filter(Boolean).join(", ");
      const next = n.items ?? [];
      const more = s.tomorrow - next.length;
      const tomorrow = next.length ? `Tomorrow: ${next.join(", ")}${more > 0 ? ` +${more} more` : ""}.` : "Tomorrow's clear so far.";
      return {
        title: `Today: ${day} · ${s.xp >= 0 ? "+" : ""}${s.xp} XP`,
        body: `${open === 0 ? "Name one win." : `Move, drop or own the open one${open === 1 ? "" : "s"}.`} ${tomorrow}`,
        url: "/app/close",
        tag: "close-out",
      };
    }
    return {
      title: "Close out the day",
      body: open === 0
        ? "Everything's done. Name one win and see tomorrow — two minutes."
        : `${open} thing${open === 1 ? "" : "s"} still open. Move, drop or own each one, then see tomorrow.`,
      url: "/app/close",
      tag: "close-out",
    };
  }
  if (n.kind === "review") {
    // Level: 1 week, 2 month, 3 quarter, 4 year — the biggest period ending today.
    const what = ["your week", n.title ? n.title.split(" ")[0] : "your month", "your quarter", "your year"][Math.min(Math.max(n.level, 1), 4) - 1]!;
    return {
      title: n.level === 4 ? "The year in review" : n.level === 1 ? "Sunday review" : `${what[0]!.toUpperCase()}${what.slice(1)} in review`,
      body: `Ten minutes to look back on ${what}: what you did, what you avoided, what changes next. Paddie has the facts ready.`,
      url: "/app/growth",
      tag: "review",
    };
  }
  if (n.kind === "fun") {
    const ideas = n.items ?? [];
    const days = n.days ?? 7;
    return {
      title: `${days} days without fun`,
      body: ideas.length ? `Paddie prescribes: ${ideas.join(", ")}. Pick one. Doctor's orders.` : "Rest is part of the game. Go do something you enjoy.",
      url: "/app/fun",
      tag: "fun",
    };
  }

  const task = n.title ?? "That task";
  if (n.kind === "application") {
    const missing = n.items ?? [];
    const still = missing.length ? `Still missing: ${missing.join(", ")}.` : "Everything's ready — submit early.";
    const closes = n.due ? ` Closes ${n.due} your time.` : "";
    const tag = `application-${task}`;
    if (n.level === 6) return { title: task, body: "Rolling deadline — places go to early applicants. Apply soon.", url: "/app/applications", tag };
    if (n.level === 7) return { title: task, body: "Results are due around now. Check your email and the portal.", url: "/app/applications", tag };
    const when = n.level === 5 ? "Your target is today" : `${n.days ?? "A few"} days to your target`;
    return { title: `${task}: ${when}`, body: `${still}${closes}`, url: "/app/applications", tag };
  }
  if (n.kind === "event") {
    const celebrates = n.eventKind === "birthday" || n.eventKind === "anniversary";
    const who = n.person ?? task;
    const at = n.due ? ` at ${n.due}` : "";
    const tag = `event-${task}`;
    switch (n.level) {
      case 1:
        return { title: `In ${n.days ?? "a few"} days`, body: celebrates ? `${task}. Sort a gift or a plan now, not the night before.` : `${task}${at}. Anything to prepare?`, url: "/app", tag };
      case 2:
        return { title: `Tomorrow${at}`, body: celebrates ? `${task} is tomorrow.` : `${task}. Get what you need ready tonight.`, url: "/app", tag };
      case 3:
        return celebrates
          ? { title: n.eventKind === "birthday" ? `It's ${who}'s birthday` : `${task} today`, body: "Call or text. A voice note counts.", url: "/app", tag }
          : { title: `Today${at}`, body: `${task}. Plan the day around it.`, url: "/app", tag };
      case 5:
        return { title: "In 10 minutes", body: `${task}${at}. Get in position.`, url: "/app", tag };
      case 6:
        return { title: "Starting now", body: `${task} has started. Are you in?`, url: "/app", tag };
      default:
        return { title: "In 30 minutes", body: `${task}${at}. Time to move.`, url: "/app", tag };
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
    return { title, body, url: "/app", tag: `task-${task}` };
  }
  if (n.kind === "headsup") {
    return { title: n.due ? `Coming up at ${n.due}` : "Coming up", body: `${task}. Get ready.`, url: "/app", tag: `task-${task}` };
  }
  if (n.kind === "checkin") {
    return { title: task, body: "Time's passed. Did you do it?", url: "/app", tag: `task-${task}` };
  }

  const escalation = [
    `${task} is due. Two minutes. Start now.`,
    `Still waiting on ${task}. The day is not getting longer.`,
    `${task}. Third call. Phone down, do it.`,
    `Last nudge for ${task} today. Late still earns XP. Go.`,
  ];
  const level = Math.min(Math.max(n.level, 1), escalation.length);
  return { title: level >= 3 ? "Paddie, again" : "Paddie", body: escalation[level - 1]!, url: "/app", tag: `task-${task}` };
}
