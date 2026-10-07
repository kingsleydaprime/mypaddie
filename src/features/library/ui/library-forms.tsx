"use client";

import { useActionState } from "react";
import { MEDIA_KINDS, MEDIA_LABEL } from "../library";
import { addFavoriteAction, saveMediaAction, type LibraryFormState } from "../library.actions";

const field = "rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base";

export function AddMediaForm() {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(saveMediaAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <select name="kind" defaultValue="book" aria-label="Kind" className={field}>
          {MEDIA_KINDS.map((k) => <option key={k} value={k}>{MEDIA_LABEL[k].replace(/s$/, "")}</option>)}
        </select>
        <input name="title" required maxLength={200} placeholder="Title" aria-label="Title" className={`${field} col-span-2`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input name="creator" maxLength={200} placeholder="By (optional)" aria-label="By" className={`${field} col-span-2`} />
        <select name="status" defaultValue="want" aria-label="Status" className={field}>
          <option value="want">Want to</option><option value="in_progress">On it</option><option value="done">Done</option>
        </select>
      </div>
      {state && "error" in state && <p className="text-sm text-red" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-on-gold disabled:opacity-60">Add</button>
    </form>
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
