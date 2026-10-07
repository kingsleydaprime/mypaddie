import Link from "next/link";
import { TIERS, type Tier } from "@/shared/domain";
import { formatMoney } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { listItems, type ItemRow, type ItemStatus } from "../items.repo";
import { TIER_INFO } from "../tiers";

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${active ? "border-gold bg-gold text-on-gold" : "border-line text-muted"}`}
    >
      {children}
    </Link>
  );
}

function ItemCard({ item }: { item: ItemRow }) {
  const details = [
    item.target,
    item.deadline && `by ${new Date(`${item.deadline}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    item.tier === "need" && item.comfortable_amount !== null &&
      (item.floor_amount !== null && item.floor_amount !== item.comfortable_amount
        ? `${formatMoney(item.floor_amount)}–${formatMoney(item.comfortable_amount)}/mo`
        : `${formatMoney(item.comfortable_amount)}/mo`),
  ].filter(Boolean);
  return (
    <li>
      <Link href={`/app/quests/${item.id}`} className="block rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="font-semibold">{item.title}</p>
        {details.length > 0 && <p className="mt-0.5 text-sm text-muted">{details.join(" · ")}</p>}
      </Link>
    </li>
  );
}

function TierSection({ tier, items, showHeading }: { tier: Tier; items: ItemRow[]; showHeading: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      {showHeading && (
        <h2 className="flex items-baseline justify-between">
          <span className="text-lg font-bold">{TIER_INFO[tier].plural}</span>
          <span className="text-sm text-muted">{items.length}</span>
        </h2>
      )}
      <p className="text-sm text-muted">{TIER_INFO[tier].blurb}</p>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

const CLOSED: { status: Exclude<ItemStatus, "active">; label: string }[] = [
  { status: "paused", label: "Paused" },
  { status: "done", label: "Done" },
  { status: "dropped", label: "Dropped" },
];

export async function QuestsScreen({ db, tier, status = "active" }: { db: Db; tier: Tier | null; status?: ItemStatus }) {
  const items = await listItems(db, { ...(tier ? { tier } : {}), status });
  const withStatus = (s: ItemStatus) => {
    const q = new URLSearchParams({ ...(tier ? { tier } : {}), ...(s !== "active" ? { status: s } : {}) }).toString();
    return `/app/quests${q ? `?${q}` : ""}`;
  };
  const byTier = (t: Tier) => items.filter((i) => i.tier === t);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quests</h1>
        <Link href={`/app/quests/new${tier ? `?tier=${tier}` : ""}`} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold">
          + Add
        </Link>
      </header>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="More">
        {[
          ["/app/me", "Me & people"],
          ["/app/growth", "Growth"],
          ["/app/routines", "Routines"],
          ["/app/commitments", "Commitments"],
          ["/app/promises", "Promises"],
          ["/app/courses", "Courses"],
          ["/app/fun", "Fun list"],
          ["/app/applications", "Applications"],
          ["/app/updates", "Updates"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 rounded-xl border border-line px-3 py-2.5 text-sm font-medium">{label}</Link>
        ))}
      </nav>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filter by tier">
        <Chip href={`/app/quests${status !== "active" ? `?status=${status}` : ""}`} active={tier === null}>All</Chip>
        {TIERS.map((t) => (
          <Chip key={t} href={`/app/quests?tier=${t}${status !== "active" ? `&status=${status}` : ""}`} active={tier === t}>
            {TIER_INFO[t].plural}
          </Chip>
        ))}
      </nav>

      {status !== "active" && (
        <p className="flex items-center justify-between text-sm text-muted">
          Showing {status} quests
          <Link href={withStatus("active")} className="font-semibold text-gold">Back to active</Link>
        </p>
      )}

      {tier ? (
        <TierSection tier={tier} items={byTier(tier)} showHeading={false} />
      ) : (
        TIERS.map((t) => <TierSection key={t} tier={t} items={byTier(t)} showHeading />)
      )}

      {status === "active" && (
        <nav className="flex gap-2" aria-label="Closed quests">
          {CLOSED.map((c) => (
            <Link key={c.status} href={withStatus(c.status)} className="rounded-xl border border-line px-3 py-2 text-sm text-muted">{c.label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
