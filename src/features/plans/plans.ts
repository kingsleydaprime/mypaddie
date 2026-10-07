/**
 * Plans: what each tier allows, and its price. The one place to change either.
 * The database stores only who chose what (public.user_plans) and the app
 * default (private.app_config → default_plan); everything is checked here.
 */
export const PLANS = ["free", "plus", "pro"] as const;
export type PlanId = (typeof PLANS)[number];

export const LIMITED = ["aiApps", "habits", "courses", "commitments", "applications", "funActivities"] as const;
export type Limited = (typeof LIMITED)[number];

export const FEATURES = ["calendarImport", "studyPlans", "loadAdvice", "builtInChat"] as const;
export type Feature = (typeof FEATURES)[number];

export interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  /** null = unlimited. */
  limits: Record<Limited, number | null>;
  features: readonly Feature[];
  /** Monthly and yearly, in whole units. Yearly = 10 months (2 free). Students pay half. */
  price: { USD: { monthly: number; yearly: number }; NGN: { monthly: number; yearly: number } };
  /** Shown as "coming soon" until it exists. */
  comingSoon?: readonly Feature[];
}

const UNLIMITED: Record<Limited, null> = { aiApps: null, habits: null, courses: null, commitments: null, applications: null, funActivities: null };

export const PLAN_INFO: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Your day, XP, money and nudges.",
    limits: { aiApps: 1, habits: 5, courses: 1, commitments: 2, applications: 3, funActivities: 10 },
    features: [],
    price: { USD: { monthly: 0, yearly: 0 }, NGN: { monthly: 0, yearly: 0 } },
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "No caps, plus the planning that keeps a full life in balance.",
    limits: { ...UNLIMITED, aiApps: 3 },
    features: ["calendarImport", "studyPlans", "loadAdvice"],
    price: { USD: { monthly: 10, yearly: 100 }, NGN: { monthly: 7_500, yearly: 75_000 } },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything, any number of AI apps, and Paddie's own chat when it lands.",
    limits: UNLIMITED,
    features: ["calendarImport", "studyPlans", "loadAdvice", "builtInChat"],
    price: { USD: { monthly: 20, yearly: 200 }, NGN: { monthly: 15_000, yearly: 150_000 } },
    comingSoon: ["builtInChat"],
  },
};

export const STUDENT_DISCOUNT = 0.5;
export const TRIAL_DAYS = 14;

export const LIMIT_LABEL: Record<Limited, string> = {
  aiApps: "AI apps connected",
  habits: "habits (repeating tasks)",
  courses: "courses",
  commitments: "jobs, roles and teams",
  applications: "open applications",
  funActivities: "fun list items",
};

export const FEATURE_LABEL: Record<Feature, string> = {
  calendarImport: "Google Calendar import",
  studyPlans: "Study plans",
  loadAdvice: "Weekly load advice",
  builtInChat: "Paddie's own chat",
};

/** The cheapest plan that has a feature / allows more than `count` of something. */
export function cheapestWith(need: { feature: Feature } | { limited: Limited; count: number }): PlanId {
  return (
    PLANS.find((p) =>
      "feature" in need ? PLAN_INFO[p].features.includes(need.feature) : (PLAN_INFO[p].limits[need.limited] ?? Infinity) > need.count,
    ) ?? "pro"
  );
}

/** Thrown when the current plan doesn't allow something; the message is shown as is (app and AI). */
export class PlanLimitError extends Error {
  constructor(
    readonly plan: PlanId,
    readonly upgradeTo: PlanId,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLAN_INFO[plan].features.includes(feature) && !PLAN_INFO[plan].comingSoon?.includes(feature);
}

export function assertFeature(plan: PlanId, feature: Feature) {
  if (PLAN_INFO[plan].features.includes(feature)) return;
  const to = cheapestWith({ feature });
  throw new PlanLimitError(plan, to, `${FEATURE_LABEL[feature]} is on ${PLAN_INFO[to].name}. You're on ${PLAN_INFO[plan].name} — upgrade in Settings → Plan.`);
}

/** `current` = how many there are now; adding one more must stay within the limit. */
export function assertWithinLimit(plan: PlanId, limited: Limited, current: number) {
  const limit = PLAN_INFO[plan].limits[limited];
  if (limit === null || current < limit) return;
  const to = cheapestWith({ limited, count: current });
  throw new PlanLimitError(plan, to, `${PLAN_INFO[plan].name} allows ${limit} ${LIMIT_LABEL[limited]}, and you have ${current}. ${PLAN_INFO[to].name} has room for more — upgrade in Settings → Plan, or remove one first.`);
}

/** Price for a choice; students pay half. Yearly is 10 months. */
export function priceFor(plan: PlanId, currency: "USD" | "NGN", period: "monthly" | "yearly", student: boolean): number {
  const base = PLAN_INFO[plan].price[currency][period];
  return student ? Math.round(base * (1 - STUDENT_DISCOUNT)) : base;
}

/** NGN for Nigerian users, USD for everyone else (what Paystack will charge in). */
export const billingCurrency = (userCurrency: string): "USD" | "NGN" => (userCurrency === "NGN" ? "NGN" : "USD");
