"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the text is selectable anyway.
        }
      }}
      className="shrink-0 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-on-gold"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
