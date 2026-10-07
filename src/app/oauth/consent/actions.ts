"use server";

import { redirect } from "next/navigation";
import { consentRules, describeDestination } from "@/features/connect/connect";
import { serverClient } from "@/shared/supabase/server";

export async function decide(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await serverClient();

  if (approve) {
    // The page's rules, checked again here: a hidden button isn't a control.
    const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (!details || !("authorization_id" in details)) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
    const rules = consentRules(describeDestination(details.redirect_uri));
    if (!rules.canApprove || (rules.mustConfirm && formData.get("confirm") !== "yes")) {
      redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&confirm=needed`);
    }
  }

  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data) throw new Error(error?.message ?? "authorization failed");

  // Back to the AI app with a code (approve) or an access_denied error (deny).
  redirect(data.redirect_url);
}
