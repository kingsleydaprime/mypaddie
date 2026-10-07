"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form's submit button that knows when its form is saving: disabled, a
 * spinner, and aria-busy, so a tap on "Did it" or "Talked today" visibly
 * does something. Drop-in for <button> inside a <form action={serverAction}>.
 */
export function SubmitButton({ children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  // A one-symbol button (✓, ✕) is too small for a spinner and its label: just the spinner.
  const tiny = typeof children !== "string" || children.length <= 2;
  return (
    <button {...rest} type={rest.type ?? "submit"} disabled={pending || disabled} aria-busy={pending || undefined} className={`${className ?? ""} ${pending ? "opacity-70" : ""}`}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="spinner" aria-hidden />
          <span className="sr-only">Saving…</span>
          {!tiny && <span aria-hidden className="opacity-80">{children}</span>}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
