import type { Db } from "@/shared/supabase/token-client";

export interface ConnectedApp {
  clientId: string;
  name: string;
  uri: string | null;
  logo: string | null;
  scopes: string[];
  grantedAt: Date;
}

/** AI apps this user has allowed (Supabase's OAuth grants). Empty if the OAuth server is off. */
export async function loadConnectedApps(db: Db): Promise<ConnectedApp[]> {
  const { data, error } = await db.auth.oauth.listGrants();
  if (error || !data) return [];
  return data
    .map((g) => ({ clientId: g.client.id, name: g.client.name || "Unnamed app", uri: g.client.uri || null, logo: g.client.logo_uri || null, scopes: g.scopes, grantedAt: new Date(g.granted_at) }))
    .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
}

/** Disconnect: consent withdrawn, its sessions deleted, its refresh tokens dead. */
export async function disconnectApp(db: Db, clientId: string) {
  const { error } = await db.auth.oauth.revokeGrant({ clientId });
  if (error) throw new Error(`disconnecting: ${error.message}`);
}
