import { addDays, weekdayOf } from "@/shared/time";

export const REVIEW_PERIODS = ["week", "month", "quarter", "year"] as const;
export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];
export const THEME_PERIODS = ["year", "quarter", "month"] as const;
export type ThemePeriod = (typeof THEME_PERIODS)[number];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12

/** The period containing `day`: weeks run Monday–Sunday. */
export function periodOf(period: ReviewPeriod | ThemePeriod, day: string): { start: string; end: string; label: string } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  switch (period) {
    case "week": {
      const start = addDays(day, -((weekdayOf(day) + 6) % 7));
      const end = addDays(start, 6);
      return { start, end, label: `Week of ${Number(start.slice(8))} ${MONTHS[Number(start.slice(5, 7)) - 1]!.slice(0, 3)}` };
    }
    case "month":
      return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`, label: `${MONTHS[m - 1]} ${y}` };
    case "quarter": {
      const q = Math.floor((m - 1) / 3);
      const endMonth = q * 3 + 3;
      return { start: `${y}-${pad(q * 3 + 1)}-01`, end: `${y}-${pad(endMonth)}-${pad(lastDayOfMonth(y, endMonth))}`, label: `Q${q + 1} ${y}` };
    }
    default:
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
  }
}

/** How long after a period ends its review is still "owed" (days, the end day included as 0). */
const GRACE: Record<ReviewPeriod, number> = { week: 2, month: 3, quarter: 7, year: 14 };

/**
 * Reviews owed today: a period that ended today or within its grace, not yet
 * reviewed. A week is owed from its Sunday; the others from their last day.
 * Biggest first — a year review covers more than a month's.
 */
export function reviewsOwed(today: string, done: ReadonlySet<string>): { period: ReviewPeriod; start: string; end: string; label: string }[] {
  const owed = [];
  for (const period of [...REVIEW_PERIODS].reverse()) {
    // The period that has most recently ended (or ends today).
    let p = periodOf(period, today);
    if (p.end > today) p = periodOf(period, addDays(p.start, -1));
    const sinceEnd = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${p.end}T00:00:00Z`)) / 86_400_000);
    const ownWeekToday = period === "week" && periodOf("week", today).end === today; // Sunday: this week's review
    const target = ownWeekToday ? periodOf("week", today) : p;
    const age = ownWeekToday ? 0 : sinceEnd;
    if (age >= 0 && age <= GRACE[period] && !done.has(`${period}:${target.start}`)) owed.push({ period, ...target });
  }
  return owed;
}

export interface ThemeLike {
  period: ThemePeriod;
  startsOn: string;
}

/** The year, quarter and month themes in force on `day`. */
export function themesFor<T extends ThemeLike>(themes: readonly T[], day: string): Partial<Record<ThemePeriod, T>> {
  const out: Partial<Record<ThemePeriod, T>> = {};
  for (const period of THEME_PERIODS) {
    const start = periodOf(period, day).start;
    const t = themes.find((x) => x.period === period && x.startsOn === start);
    if (t) out[period] = t;
  }
  return out;
}

export const QUESTIONS: Record<ReviewPeriod, { key: string; q: string }[]> = (() => {
  const week = [
    { key: "did", q: "What did I actually do?" },
    { key: "avoided", q: "What did I avoid?" },
    { key: "grew", q: "Where did I grow?" },
    { key: "patterns", q: "What patterns showed up?" },
    { key: "drained", q: "What drained me?" },
    { key: "energised", q: "What gave me energy?" },
    { key: "change", q: "What should change next week?" },
  ];
  const longer = (span: string) => [
    { key: "proud", q: `What am I proudest of this ${span}?` },
    { key: "theme", q: `Did I live this ${span}'s theme? Where did I drift?` },
    ...week.slice(1, 6),
    { key: "people", q: "Who mattered, and who did I neglect?" },
    { key: "change", q: `What carries into the next ${span}, and what stays behind?` },
  ];
  return { week, month: longer("month"), quarter: longer("quarter"), year: longer("year") };
})();
