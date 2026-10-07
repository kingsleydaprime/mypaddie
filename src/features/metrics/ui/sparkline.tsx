/** A small line of weekly values; gaps where nothing was logged. Gold = the trend is going the better way. */
export function Sparkline({ values, good }: { values: (number | null)[]; good: boolean | null }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="h-8 w-28" aria-hidden />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const w = 112;
  const h = 32;
  const x = (i: number) => (values.length === 1 ? w / 2 : (i * (w - 4)) / (values.length - 1) + 2);
  const y = (v: number) => (hi === lo ? h / 2 : h - 3 - ((v - lo) * (h - 6)) / (hi - lo));
  // Break the line where a week is missing.
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) segments.push(current);
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-8 w-28 ${good ? "text-gold" : "text-muted"}`} aria-hidden>
      {segments.map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
      <circle cx={x(last)} cy={y(values[last]!)} r={2.5} fill="currentColor" />
    </svg>
  );
}
