export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl animate-pulse flex-col gap-4 px-5 pt-10" role="status" aria-label="Loading">
      <div className="h-12 w-2/3 rounded-lg bg-surface-2" />
      <div className="h-5 w-1/2 rounded bg-surface" />
      <div className="h-40 rounded-3xl bg-surface" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
