import type { Db } from "@/shared/supabase/token-client";

/** Whether sign-up needs an invite right now (private.app_config → invites_required). Fails closed. */
export async function invitesRequired(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("signup_settings");
  if (error || !data) return true;
  return (data as { invitesRequired?: boolean }).invitesRequired !== false;
}
