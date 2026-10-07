import Link from "next/link";
import { MEDIA_LABEL, type MediaKind, type MediaStatus } from "@/features/library/library";
import { removeFavoriteAction, removeMediaAction, setMediaStatusAction } from "@/features/library/library.actions";
import { loadFavorites, loadMedia } from "@/features/library/library.repo";
import { AddFavoriteForm, AddMediaForm } from "@/features/library/ui/library-forms";
import { requireDb } from "@/shared/supabase/session";
import { SubmitButton } from "@/shared/ui/submit-button";

const GROUPS: { status: MediaStatus; title: string }[] = [
  { status: "in_progress", title: "On it" },
  { status: "want", title: "Want to get to" },
  { status: "done", title: "Done" },
];

export default async function LibraryPage() {
  const db = await requireDb("/app/me/library");
  const [media, favorites] = await Promise.all([loadMedia(db), loadFavorites(db)]);
  const byCategory = new Map<string, typeof favorites>();
  for (const f of favorites) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/app/me" className="text-muted" aria-label="Back to me">‹ Me</Link>
        <h1 className="text-2xl font-bold">Library</h1>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4"><AddMediaForm /></section>
      {GROUPS.map(({ status, title }) => {
        const list = media.filter((m) => m.status === status);
        if (!list.length) return null;
        return (
          <section key={status} className="flex flex-col gap-2">
            <h2 className="font-bold">{title}</h2>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {list.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title}{m.rating ? ` · ${"★".repeat(m.rating)}` : ""}</span>
                    <span className="text-xs text-muted">{MEDIA_LABEL[m.kind as MediaKind].replace(/s$/, "")}{m.creator ? ` · ${m.creator}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    {status === "want" && <form action={setMediaStatusAction.bind(null, m.kind as MediaKind, m.title, "in_progress", undefined)}><SubmitButton className="font-semibold text-gold">Start</SubmitButton></form>}
                    {status === "in_progress" && <form action={setMediaStatusAction.bind(null, m.kind as MediaKind, m.title, "done", undefined)}><SubmitButton className="font-semibold text-gold">Finished</SubmitButton></form>}
                    <form action={removeMediaAction.bind(null, m.id)}><SubmitButton className="text-muted">✕</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Favourite things</h2>
        {[...byCategory].map(([cat, list]) => (
          <p key={cat} className="text-sm">
            <span className="text-muted">{cat[0]!.toUpperCase() + cat.slice(1)}:</span>{" "}
            {list.map((f, i) => (
              <span key={f.id}>
                {i > 0 && ", "}{f.value}
                <form action={removeFavoriteAction.bind(null, f.id)} className="inline"><SubmitButton className="ml-1 text-xs text-muted" aria-label={`Remove ${f.value}`}>✕</SubmitButton></form>
              </span>
            ))}
          </p>
        ))}
        <AddFavoriteForm />
      </section>
    </div>
  );
}
