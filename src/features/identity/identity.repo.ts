import type { Db } from "@/shared/supabase/token-client";

export interface IdentityProfile {
  id: string;
  name: string;
  text: string;
}

export async function loadActiveIdentity(db: Db): Promise<IdentityProfile | null> {
  const { data, error } = await db.from("identity_profiles").select("id, name, text").eq("is_active", true).maybeSingle();
  if (error) throw new Error(`loading identity: ${error.message}`);
  return data;
}

/** Edit a version in place (default: the active one). */
export async function updateIdentity(db: Db, changes: { id?: string; name?: string; text?: string }) {
  const target = changes.id ? { id: changes.id } : await loadActiveIdentity(db);
  if (!target) return { result: "no_active_profile" as const };
  const { data, error } = await db
    .from("identity_profiles")
    .update({ ...(changes.name ? { name: changes.name } : {}), ...(changes.text ? { text: changes.text } : {}) })
    .eq("id", target.id)
    .select("id, name")
    .maybeSingle();
  if (error) throw new Error(`updating identity: ${error.message}`);
  return data ? { result: "updated" as const, ...data } : { result: "not_found" as const };
}
