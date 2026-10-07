import { disconnectAction } from "../connect.actions";
import type { ConnectedApp } from "../connect.repo";
import { CopyButton } from "./copy-button";
import { SubmitButton } from "@/shared/ui/submit-button";

const OPEN = [
  { name: "Claude", href: "https://claude.ai/new" },
  { name: "ChatGPT", href: "https://chatgpt.com/" },
];

/** The one URL an AI app needs, how to add it, and what's connected. */
export function ConnectPanel({ mcpUrl, apps }: { mcpUrl: string; apps: ConnectedApp[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">Connect your AI</h2>
      <p className="-mt-2 text-sm text-muted">Paddie talks to you through your AI app. Add this address to it once:</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2">
        <code className="min-w-0 flex-1 truncate px-1 text-sm select-all">{mcpUrl}</code>
        <CopyButton text={mcpUrl} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Claude</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>On claude.ai (web or desktop): Settings → Connectors → Add custom connector.</li>
          <li>Name it MyPaddie, paste the address, and add it.</li>
          <li>Press Connect, sign in to MyPaddie, and choose Allow.</li>
          <li>In a chat, say &ldquo;What&apos;s today?&rdquo;. It then works in the Claude phone app too.</li>
        </ol>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">ChatGPT</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>On chatgpt.com: Settings → Apps &amp; Connectors → Advanced settings, and turn on Developer mode.</li>
          <li>Create a connector: name it MyPaddie, paste the address, authentication OAuth.</li>
          <li>Sign in to MyPaddie when asked and choose Allow, then pick MyPaddie in a new chat.</li>
        </ol>
      </details>
      <p className="text-xs text-muted">Menus move around between app versions — look for &ldquo;connectors&rdquo; or &ldquo;MCP&rdquo; if these don&apos;t match.</p>

      <div className="grid grid-cols-2 gap-2">
        {OPEN.map((c) => (
          <a key={c.name} href={c.href} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line px-2 py-2.5 text-center text-sm font-semibold">
            Open {c.name} <span className="text-muted" aria-hidden>↗</span>
          </a>
        ))}
      </div>

      <h3 className="mt-1 text-sm font-bold">Connected</h3>
      {apps.length === 0 ? (
        <p className="-mt-2 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="-mt-1 flex flex-col divide-y divide-line rounded-xl border border-line">
          {apps.map((a) => (
            <li key={a.clientId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="text-xs text-muted">since {a.grantedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </span>
              <form action={disconnectAction.bind(null, a.clientId)}>
                <SubmitButton className="rounded-lg border border-line px-3 py-1.5 text-sm text-red">Disconnect</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
