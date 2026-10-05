import { copyFor, type NotificationCopy, type Nudge } from "./copy";

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type OutgoingNudge = Nudge & Subscription;

export interface Notification {
  subscription: Subscription;
  copy: NotificationCopy;
}

/** "Reading, Duolingo, Gym +1" */
function list(names: string[], show = 3): string {
  const head = names.slice(0, show).join(", ");
  return names.length > show ? `${head} +${names.length - show}` : head;
}

/**
 * Turns the database's nudges into the notifications actually shown, per
 * device. When `threshold` or more overdue items (nudges + check-ins) land at
 * once, they become one notification instead of a pile — the blueprint's
 * "reduce decision fatigue". Heads-ups bundle the same way, separately. The
 * morning brief is always its own notification.
 */
export function planNotifications(nudges: readonly OutgoingNudge[], threshold = 3): Notification[] {
  const byDevice = new Map<string, OutgoingNudge[]>();
  for (const n of nudges) byDevice.set(n.endpoint, [...(byDevice.get(n.endpoint) ?? []), n]);

  const out: Notification[] = [];
  for (const group of byDevice.values()) {
    const subscription = { endpoint: group[0]!.endpoint, p256dh: group[0]!.p256dh, auth: group[0]!.auth };
    const push = (copy: NotificationCopy) => out.push({ subscription, copy });

    for (const n of group.filter((n) => n.kind === "brief")) push(copyFor(n));

    const overdue = group.filter((n) => n.kind === "nudge" || n.kind === "checkin");
    if (overdue.length >= threshold) {
      const firm = overdue.some((n) => n.kind === "nudge" && n.level >= 3);
      push({
        title: `${firm ? "Paddie, again: " : ""}${overdue.length} things need you`,
        body: `${list(overdue.map((n) => n.title ?? "a task"))}. Pick one.`,
        url: "/",
        tag: "bundle-overdue",
      });
    } else {
      for (const n of overdue) push(copyFor(n));
    }

    const upcoming = group.filter((n) => n.kind === "headsup" || n.kind === "reminder");
    if (upcoming.length >= threshold) {
      const allTomorrow = upcoming.every((n) => n.kind === "reminder" && n.level === 1);
      push({
        title: allTomorrow ? "Tomorrow" : "Coming up",
        body: upcoming.map((n) => (n.due ? `${n.title} ${n.due}` : n.title)).join(" · "),
        url: "/",
        tag: "bundle-upcoming",
      });
    } else {
      for (const n of upcoming) push(copyFor(n));
    }
  }
  return out;
}
