"use server";

import { redirect } from "next/navigation";
import { serverClient } from "@/shared/supabase/server";

export async function decide(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await serverClient();

  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data) throw new Error(error?.message ?? "authorization failed");

  // Back to Claude with a code (approve) or an access_denied error (deny).
  redirect(data.redirect_url);
}
