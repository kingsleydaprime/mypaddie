import type { Metadata } from "next";
import { CopyButton } from "@/features/connect/ui/copy-button";
import { Step } from "@/features/onboarding/steps";
import { siteOrigin } from "@/shared/site";
import { requireDb } from "@/shared/supabase/session";

export const metadata: Metadata = { title: "Connect your AI — MyPaddie" };

export default async function ConnectStep() {
  await requireDb("/welcome/connect");
  const url = `${await siteOrigin()}/api/mcp`;
  return (
    <Step n={2} title="Connect your AI" next="/welcome/reminders" nextLabel="I've connected it" skip="/welcome/reminders">
      <p className="text-muted">Paddie talks to you through Claude or ChatGPT — free plans work. Add this address to your AI app once:</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
        <code className="min-w-0 flex-1 truncate px-1 text-sm select-all">{url}</code>
        <CopyButton text={url} />
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-semibold">Claude</p>
          <p className="text-muted">claude.ai → Settings → Connectors → Add custom connector → paste → Connect → Allow.</p>
        </div>
        <div>
          <p className="font-semibold">ChatGPT</p>
          <p className="text-muted">chatgpt.com → Settings → Apps &amp; Connectors → Advanced → Developer mode on → Create → paste, OAuth → sign in → Allow.</p>
        </div>
      </div>
      <p className="text-xs text-muted">Do this on a computer if it&apos;s easier — it then works in the phone apps too. You can find this again in Settings.</p>
    </Step>
  );
}
