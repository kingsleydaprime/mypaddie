"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A task's description, clamped to a preview; tap it to read the whole thing
 * in place, tap again to fold it. Only clickable when there's more to show.
 */
export function ExpandableText({ text, lines }: { text: string; lines: 1 | 2 }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  const clamp = open ? "" : lines === 2 ? "line-clamp-2" : "line-clamp-1";
  return (
    <>
    <p
      ref={ref}
      onClick={clipped || open ? () => setOpen((o) => !o) : undefined}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (clipped || open) && (e.preventDefault(), setOpen((o) => !o))}
      role={clipped || open ? "button" : undefined}
      tabIndex={clipped || open ? 0 : undefined}
      aria-expanded={clipped || open ? open : undefined}
      className={`mt-0.5 whitespace-pre-line break-words text-sm text-muted ${clamp} ${clipped || open ? "cursor-pointer" : ""}`}
    >
      {text}
    </p>
    {clipped && !open && <span aria-hidden className="text-xs text-muted">Tap to read more</span>}
    </>
  );
}
