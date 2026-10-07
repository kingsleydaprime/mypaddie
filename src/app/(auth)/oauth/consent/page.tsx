import { redirect } from "next/navigation";
import { enterUser } from "@/shared/user-context";
import type { Db } from "@/shared/supabase/token-client";
import { aiAppRoom } from "@/features/connect/ai-app-limit";
import { serverClient } from "@/shared/supabase/server";
import { consentRules, describeDestination } from "@/features/connect/connect";
import { decide } from "./actions";
import { SubmitButton } from "@/shared/ui/submit-button";

/**
 * Supabase Auth sends you here mid-OAuth (Authentication → OAuth Server →
 * authorization path). Must be signed in; then shows who is asking and lets
 * you allow or deny.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id, confirm } = await searchParams;
  if (typeof authorization_id !== "string" || !authorization_id) {
    return <Message text="This link is missing its authorization id. Start again from your AI app." />;
  }

  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  await enterUser(supabase as Db);
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id);
  if (error || !data) return <Message text="This request has expired or is invalid. Start again from your AI app." />;
  if (!("authorization_id" in data)) redirect(data.redirect_url); // already allowed before: straight back

  const dest = describeDestination(data.redirect_uri);
  const room = await aiAppRoom(supabase as Db, data.client.id);
  const rules = room.ok ? consentRules(dest) : { canApprove: false, mustConfirm: false };
  const app = dest.kind === "known" ? dest.app : data.client.name;
  return (
    <>
      <h1 className="text-2xl font-semibold">Connect {app} to MyPaddie?</h1>
      <p>
        It will be able to read and change your MyPaddie data — tasks, XP, money, promises and notes — as{" "}
        <strong>{data.user.email}</strong>, until you disconnect it in Settings.
      </p>

      {dest.kind === "known" && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          ✓ Access goes to <strong>{dest.host}</strong>, {dest.app}&apos;s own address.
        </p>
      )}
      {(dest.kind === "unknown" || dest.kind === "local") && (
        <div className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm" role="alert">
          <p className="font-semibold">MyPaddie doesn&apos;t recognise this app.</p>
          <p className="mt-1">
            It calls itself &ldquo;{data.client.name}&rdquo;, but access would go to{" "}
            <strong>{dest.kind === "local" ? `a program on this computer (${dest.host})` : dest.host}</strong>. Only allow this if you just
            added MyPaddie to that app yourself. If a link or a message sent you here, deny it.
          </p>
        </div>
      )}
      {!room.ok && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" role="alert">
          {room.message} <a href="/app/billing" className="text-gold underline">Plans</a>
        </p>
      )}
      {room.ok && !rules.canApprove && (
        <p className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm" role="alert">
          This request can&apos;t be allowed: it would send your access to an unsafe address ({"host" in dest ? dest.host : "invalid"}).
        </p>
      )}
      {confirm === "needed" && rules.mustConfirm && <p className="text-sm text-red" role="alert">Tick the box first.</p>}

      <form action={decide} className="flex flex-col gap-3">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        {rules.mustConfirm && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" value="yes" required className="mt-1 accent-[var(--gold)]" />
            <span>I started this myself, just now, from that app.</span>
          </label>
        )}
        <div className="flex gap-3">
          <SubmitButton name="decision" value="deny" formNoValidate className="flex-1 rounded-xl border border-line px-4 py-3.5 font-medium">Deny</SubmitButton>
          {rules.canApprove && (
            <SubmitButton name="decision" value="approve"
              className={`flex-1 rounded-xl px-4 py-3.5 text-base font-semibold ${rules.mustConfirm ? "border border-gold text-gold" : "bg-gold text-on-gold"}`}>
              Allow
            </SubmitButton>
          )}
        </div>
      </form>
    </>
  );
}

function Message({ text }: { text: string }) {
  return <p>{text}</p>;
}
