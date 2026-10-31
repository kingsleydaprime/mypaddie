"use client";

import { useActionState, useState } from "react";
import { FORMAT_LABEL, MEDIA_FORMATS, MEDIA_KINDS, MEDIA_LABEL, type MediaFormat, type MediaKind, type MediaStatus } from "../library";
import { addFavoriteAction, editMediaAction, saveMediaAction, type LibraryFormState } from "../library.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

/** Hard copy · PDF / e-book · Audiobook, as one row of pills. Tap the chosen one again to clear it. */
function FormatPicker({ value, onChange }: { value: MediaFormat | ""; onChange: (f: MediaFormat | "") => void }) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Format</legend>
      <input type="hidden" name="format" value={value} />
      {MEDIA_FORMATS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(value === f ? "" : f)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${value === f ? "border-gold bg-gold/10 font-semibold text-gold" : "border-line text-muted"}`}
        >
          {FORMAT_LABEL[f]}
        </button>
      ))}
    </fieldset>
  );
}

export function AddMediaForm() {
  const [kind, setKind] = useState<MediaKind>("book");
  const [format, setFormat] = useState<MediaFormat | "">("");
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(async (prev, form) => {
    const r = await saveMediaAction(prev, form);
    if (r && "ok" in r) setFormat(""); // a fresh picker for the next one
    return r;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as MediaKind)} aria-label="Kind" className={field}>
          {MEDIA_KINDS.map((k) => <option key={k} value={k}>{MEDIA_LABEL[k].replace(/s$/, "")}</option>)}
        </select>
        <input name="title" required maxLength={200} placeholder="Title" aria-label="Title" className={`${field} col-span-2`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input name="creator" maxLength={200} placeholder={kind === "book" ? "Author (optional)" : "By (optional)"} aria-label="By" className={`${field} col-span-2`} />
        <select name="status" defaultValue="want" aria-label="Status" className={field}>
          <option value="want">Want to</option><option value="in_progress">On it</option><option value="done">Done</option>
        </select>
      </div>
      {kind === "book" && <FormatPicker value={format} onChange={setFormat} />}
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold disabled:opacity-60">Add</button>
    </form>
  );
}

export interface MediaItemData {
  id: string;
  kind: MediaKind;
  title: string;
  creator: string | null;
  format: MediaFormat | null;
  status: MediaStatus;
  rating: number | null;
  notes: string | null;
}

/** A library row: tap it to edit anything about it, the title and format included. `actions` are the row's quick buttons. */
export function MediaItem({ item, actions }: { item: MediaItemData; actions: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MediaKind>(item.kind);
  const [format, setFormat] = useState<MediaFormat | "">(item.format ?? "");
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(async (prev, form) => {
    const r = await editMediaAction(item.id, prev, form);
    if (r && "ok" in r) setOpen(false);
    return r;
  }, null);

  const meta = [MEDIA_LABEL[item.kind].replace(/s$/, ""), item.format ? FORMAT_LABEL[item.format] : null, item.creator].filter(Boolean).join(" · ");
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 text-left">
          <span className="block truncate font-medium">{item.title}{item.rating ? <span className="text-gold"> · {"★".repeat(item.rating)}</span> : ""}</span>
          <span className="block truncate text-xs text-muted">{meta}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2 text-xs">{actions}</span>
      </div>
      {open && (
        <form action={action} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <div className="grid grid-cols-3 gap-2">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as MediaKind)} aria-label="Kind" className={field}>
              {MEDIA_KINDS.map((k) => <option key={k} value={k}>{MEDIA_LABEL[k].replace(/s$/, "")}</option>)}
            </select>
            <input name="title" defaultValue={item.title} required maxLength={200} aria-label="Title" className={`${field} col-span-2`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input name="creator" defaultValue={item.creator ?? ""} maxLength={200} placeholder={kind === "book" ? "Author" : "By"} aria-label="By" className={`${field} col-span-2`} />
            <select name="status" defaultValue={item.status} aria-label="Status" className={field}>
              <option value="want">Want to</option><option value="in_progress">On it</option><option value="done">Done</option><option value="dropped">Dropped</option>
            </select>
          </div>
          {kind === "book" && <FormatPicker value={format} onChange={setFormat} />}
          <select name="rating" defaultValue={item.rating ?? ""} aria-label="Rating" className={field}>
            <option value="">No rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
          <textarea name="notes" defaultValue={item.notes ?? ""} rows={2} maxLength={2000} placeholder="Notes (optional)" aria-label="Notes" className={field} />
          {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="flex-1 rounded-xl bg-gold px-4 py-2 font-semibold text-on-gold disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-muted">Close</button>
          </div>
        </form>
      )}
    </li>
  );
}

export function AddFavoriteForm() {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(addFavoriteAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <input name="category" required maxLength={40} list="fav-cats" placeholder="Song, food…" aria-label="Kind of favourite" className={field} />
        <datalist id="fav-cats">{["song", "food", "artist", "film", "book", "place", "colour", "verse", "drink", "sport"].map((c) => <option key={c} value={c} />)}</datalist>
        <input name="value" required maxLength={200} placeholder="What it is" aria-label="What it is" className={`${field} col-span-2`} />
      </div>
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl border border-gold px-4 py-2.5 font-semibold text-gold disabled:opacity-60">Add favourite</button>
    </form>
  );
}
