import type { ReactNode } from "react";

/** Readable long-form text for the legal pages. */
export function Prose({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8 leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-gold [&_a]:underline">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-sm text-muted">Last updated {updated}</p>
      {children}
    </article>
  );
}
