"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface TickItem {
  key: string;
  title: string;
  done: boolean;
}

/**
 * Checkboxes on a card, each ticked on its own and in any order. `onToggle`
 * does the work and returns the line to show after it.
 */
export function TickList({ items, onToggle }: { items: TickItem[]; onToggle: (item: TickItem, index: number) => Promise<string | null> }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = (item: TickItem, index: number) => {
    setBusy(item.key);
    run(async () => {
      setNote(await onToggle(item, index));
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-1">
      <ul className="flex flex-col">
        {items.map((item, i) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => toggle(item, i)}
              disabled={pending}
              role="checkbox"
              aria-checked={item.done}
              className="flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm disabled:opacity-60"
            >
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${item.done ? "border-gold bg-gold text-on-gold" : "border-line"}`}
              >
                {busy === item.key ? "…" : item.done ? "✓" : ""}
              </span>
              <span className={item.done ? "text-muted line-through" : ""}>{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm text-gold" role="status">{note}</p>}
    </div>
  );
}
