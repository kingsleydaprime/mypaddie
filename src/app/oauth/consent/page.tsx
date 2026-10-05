import { redirect } from "next/navigation";
import { serverClient } from "@/shared/supabase/server";
import { decide } from "./actions";

/**
 * Supabase Auth sends you here mid-OAuth (Authentication → OAuth Server →
 * authorization path). Must be signed in; then shows who is asking and lets
 * you allow or deny.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id } = await searchParams;
  if (typeof authorization_id !== "string" || !authorization_id) {
    return <Message text="This link is missing its authorization id. Start again from Claude." />;
  }

  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id);
  if (error || !data) return <Message text="This request has expired or is invalid. Start again from Claude." />;
  if (!("authorization_id" in data)) redirect(data.redirect_url); // already allowed before: straight back

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-4">
      <h1 className="text-2xl font-semibold">Allow {data.client.name}?</h1>
      <p>
        <strong>{data.client.name}</strong> wants to read and update your MyPaddie data — tasks, XP, money and
        notes — as <strong>{data.user.email}</strong>.
      </p>
      <p className="text-sm opacity-70">It will be sent back to {data.redirect_uri}</p>
      <form action={decide} className="flex gap-3">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button name="decision" value="deny" className="flex-1 rounded-lg border px-3 py-3">Deny</button>
        <button name="decision" value="approve"
          className="flex-1 rounded-lg bg-black px-3 py-3 font-medium text-white dark:bg-white dark:text-black">
          Allow
        </button>
      </form>
    </main>
  );
}

function Message({ text }: { text: string }) {
  return <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4"><p>{text}</p></main>;
}
