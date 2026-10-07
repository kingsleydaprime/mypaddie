import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";
import { planNotifications } from "@/features/push/bundle";

/**
 * Called by the database's scheduler (private.send_nudges) with nudges it has
 * already decided on. This route has no database access at all: it checks the
 * shared secret, words each nudge, and hands it to the browser push service.
 */
const body = z.object({
  nudges: z.array(
    z.object({
      endpoint: z.url(),
      p256dh: z.string(),
      auth: z.string(),
      kind: z.enum(["nudge", "checkin", "brief", "headsup", "reminder", "event", "application", "fun", "review", "close_out"]),
      level: z.number().int(),
      title: z.string().nullable(),
      items: z.array(z.string()).nullable(),
      due: z.string().nullable().optional(),
      eventKind: z.string().nullable().optional(),
      person: z.string().nullable().optional(),
      days: z.number().int().nullable().optional(),
      note: z.string().nullable().optional(),
    }),
  ),
});

function secretMatches(given: string | null): boolean {
  const expected = process.env.PUSH_CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Constant-time compare: response timing can't leak how much of a guess was right.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-push-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject) {
    return new Response("Push is not configured", { status: 503 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  // Several nudges at once for one device become one notification (see bundle.ts).
  const notifications = planNotifications(parsed.data.nudges);
  const results = await Promise.allSettled(
    notifications.map((n) =>
      webpush.sendNotification(
        { endpoint: n.subscription.endpoint, keys: { p256dh: n.subscription.p256dh, auth: n.subscription.auth } },
        JSON.stringify(n.copy),
        { TTL: 60 * 60 },
      ),
    ),
  );

  // 404/410 = the device unsubscribed or reinstalled. Reported back so it can be pruned.
  const gone = [
    ...new Set(
      notifications
        .filter((_, i) => {
          const r = results[i]!;
          return r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number }).statusCode ?? 0);
        })
        .map((n) => n.subscription.endpoint),
    ),
  ];
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.error("push: some notifications failed", results.filter((r) => r.status === "rejected"));

  return Response.json({ sent: results.length - failed, failed, gone });
}
