/** While an app page loads: the shape of a page, gently pulsing, instead of a frozen screen. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" role="status" aria-label="Loading">
      <div className="h-8 w-40 rounded-lg bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface" />
      <div className="h-16 rounded-2xl bg-surface" />
      <div className="h-16 rounded-2xl bg-surface" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
