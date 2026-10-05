import Link from "next/link";
import { TIERS, type Tier } from "@/shared/domain";
import { formatNaira } from "@/shared/format";
import type { Db } from "@/shared/supabase/token-client";
import { listItems, type ItemRow } from "../items.repo";
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
        ? `${formatNaira(item.floor_amount)}–${formatNaira(item.comfortable_amount)}/mo`
        : `${formatNaira(item.comfortable_amount)}/mo`),
  ].filter(Boolean);
  return (
    <li className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="font-semibold">{item.title}</p>
      {details.length > 0 && <p className="mt-0.5 text-sm text-muted">{details.join(" · ")}</p>}
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

export async function QuestsScreen({ db, tier }: { db: Db; tier: Tier | null }) {
  const items = await listItems(db, tier ? { tier } : {});
  const byTier = (t: Tier) => items.filter((i) => i.tier === t);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quests</h1>
        <div className="flex gap-2">
          <Link href="/applications" className="rounded-xl border border-line px-3 py-2.5 text-sm font-medium">Applications ›</Link>
          <Link href={`/quests/new${tier ? `?tier=${tier}` : ""}`} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold">
            + Add
          </Link>
        </div>
      </header>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filter by tier">
        <Chip href="/quests" active={tier === null}>All</Chip>
        {TIERS.map((t) => (
          <Chip key={t} href={`/quests?tier=${t}`} active={tier === t}>
            {TIER_INFO[t].plural}
          </Chip>
        ))}
      </nav>

      {tier ? (
        <TierSection tier={tier} items={byTier(tier)} showHeading={false} />
      ) : (
        TIERS.map((t) => <TierSection key={t} tier={t} items={byTier(t)} showHeading />)
      )}
    </div>
  );
}
