import type { Db } from "@/shared/supabase/token-client";

export type InviteStatus = "waiting" | "used" | "expired" | "revoked";

export interface Invite {
  id: string;
  code: string;
  email: string | null;
  note: string | null;
  createdAt: Date;
  expiresAt: Date;
  status: InviteStatus;
}

export function inviteStatus(i: { used_at: string | null; revoked_at: string | null; expires_at: string }, now: Date): InviteStatus {
  if (i.used_at) return "used";
  if (i.revoked_at) return "revoked";
  if (Date.parse(i.expires_at) <= now.getTime()) return "expired";
  return "waiting";
}

export async function loadInvites(db: Db, now: Date): Promise<{ invites: Invite[]; left: number }> {
  const [{ data, error }, left] = await Promise.all([
    db.from("invites").select("id, code, email, note, created_at, expires_at, used_at, revoked_at").order("created_at", { ascending: false }),
    db.rpc("invites_left"),
  ]);
  if (error) throw new Error(`loading invites: ${error.message}`);
  return {
    left: left.data ?? 0,
    invites: data.map((i) => ({
      id: i.id, code: i.code, email: i.email, note: i.note,
      createdAt: new Date(i.created_at), expiresAt: new Date(i.expires_at), status: inviteStatus(i, now),
    })),
  };
}

export async function createInvite(db: Db, input: { email?: string | null; note?: string | null }) {
  const { data, error } = await db.rpc("create_invite", { p_email: (input.email ?? null) as string, p_note: (input.note ?? null) as string });
  if (error?.message.includes("no invites left")) return { result: "none_left" as const };
  if (error) throw new Error(`creating the invite: ${error.message}`);
  const row = (data as { code: string; invites_left: number }[])[0]!;
  return { result: "created" as const, code: row.code, left: row.invites_left };
}

/** Only an unused invite can be revoked; revoking gives the slot back. */
export async function revokeInvite(db: Db, id: string, now: Date) {
  const { error } = await db.from("invites").update({ revoked_at: now.toISOString() }).eq("id", id).is("used_at", null);
  if (error) throw new Error(`revoking the invite: ${error.message}`);
}
