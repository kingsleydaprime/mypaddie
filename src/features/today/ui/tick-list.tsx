"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface TickItem {
  key: string;
  title: string;
  done: boolean;
  missed?: boolean;
}

/**
 * Checkboxes on a card, each ticked on its own and in any order. `onToggle`
 * does the work and returns the line to show after it. An optional `onMiss`
 * allows self-reporting a step as missed.
 */
export function TickList({
  items,
  onToggle,
  onMiss,
}: {
  items: TickItem[];
  onToggle: (item: TickItem, index: number) => Promise<string | null>;
  onMiss?: (item: TickItem, index: number) => Promise<string | null>;
}) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = (item: TickItem, index: number) => {
    if (item.missed) return;
    setBusy(item.key);
    run(async () => {
      setNote(await onToggle(item, index));
      setBusy(null);
      router.refresh();
    });
  };

  const miss = (item: TickItem, index: number) => {
    if (!onMiss) return;
    setBusy(item.key);
    run(async () => {
      setNote(await onMiss(item, index));
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-1">
      <ul className="flex flex-col">
        {items.map((item, i) => (
          <li key={item.key}>
            <div className="flex w-full items-center gap-2 py-0.5">
              <button
                type="button"
                onClick={() => toggle(item, i)}
                disabled={pending || item.missed}
                role="checkbox"
                aria-checked={item.done || item.missed}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 text-left text-sm disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                    item.done
                      ? "border-green bg-green text-white"
                      : item.missed
                      ? "border-red bg-red text-white"
                      : "border-line"
                  }`}
                >
                  {busy === item.key ? "…" : item.done ? "✓" : item.missed ? "✕" : ""}
                </span>
                <span
                  className={`truncate ${
                    item.missed
                      ? "text-muted line-through decoration-red"
                      : item.done
                      ? "text-muted line-through"
                      : ""
                  }`}
                >
                  {item.title}
                </span>
              </button>
              {onMiss && !item.done && !item.missed && (
                <button
                  type="button"
                  onClick={() => miss(item, i)}
                  disabled={pending}
                  title="Mark missed"
                  aria-label={`Mark "${item.title}" missed`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-red active:scale-95 disabled:opacity-60"
                >
                  Miss
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm text-gold" role="status">{note}</p>}
    </div>
  );
}
