"use client";

import { useState, type ReactNode } from "react";

/**
 * A summary line that opens to show what's under it (a routine's steps, a
 * task's checklist) and folds it away again.
 */
export function Fold({ summary, defaultOpen = false, children }: { summary: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-0.5 flex items-center gap-1.5 text-left text-sm text-muted"
      >
        <span aria-hidden className={`inline-block w-3 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        <span>{summary}</span>
      </button>
      {open && children}
    </>
  );
}
