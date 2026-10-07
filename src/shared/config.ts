/**
 * Every tunable number in the engine, in one place. The defaults are the
 * Day 1 agreement (see DECISIONS.md); per-user values will come from the
 * `settings` table and be merged over these.
 */
export interface EngineConfig {
  /** IANA zone that decides where a "day" starts and ends. */
  timeZone: string;
  /** ISO 4217 code money is shown in. Amounts are whole units of it. */
  currency: string;
  xp: {
    /** Share of base XP paid when a task is done after its due time. */
    lateMultiplier: number;
    /** Share of base XP deducted when a need is ignored. */
    ignoredNeedPenalty: number;
    /** Share of a promise's XP deducted when it's broken (not kept, released or renegotiated in time). */
    brokenPromisePenalty: number;
    goalCompletionMultiplier: number;
    dreamMilestoneMultiplier: number;
    wishBonus: number;
    /** Paid to Financial for every logged transaction, dumb purchases included. */
    transactionLogXp: number;
  };
  mode: {
    /** Slips on the same task (or recurring item) inside the window that flip to strict. */
    repeatSlipThreshold: number;
    repeatSlipWindowDays: number;
    ignoredNeedThreshold: number;
    ignoredNeedWindowDays: number;
    /** Check-in energy (1–5) at or below this is a low-HP day. */
    lowEnergyMax: number;
  };
  slips: {
    /** The Nth time the same reason is given for the same habit, it's an excuse. */
    excuseRepeatThreshold: number;
    excuseWindowDays: number;
  };
  money: {
    /**
     * Money is measured in fixed periods counted from the first logged
     * transaction. Period 1 is the audit; after that the stage comes from the
     * last *complete* period, so it can't flip daily as payday slides in and
     * out of a rolling window.
     */
    periodDays: number;
  };
}

export const DEFAULT_CONFIG: EngineConfig = {
  timeZone: "Africa/Lagos",
  currency: "NGN",
  xp: {
    lateMultiplier: 0.5,
    ignoredNeedPenalty: 0.5,
    brokenPromisePenalty: 1,
    goalCompletionMultiplier: 2,
    dreamMilestoneMultiplier: 3,
    wishBonus: 50,
    transactionLogXp: 2,
  },
  mode: {
    repeatSlipThreshold: 2,
    repeatSlipWindowDays: 7,
    ignoredNeedThreshold: 3,
    ignoredNeedWindowDays: 3,
    lowEnergyMax: 2,
  },
  slips: {
    excuseRepeatThreshold: 3,
    excuseWindowDays: 7,
  },
  money: {
    periodDays: 30,
  },
};

// ─── The signed-in user's config ────────────────────────────────────────────
// Each user has their own time zone and currency. On the server, the request
// sets them up once (src/shared/user-context.ts registers the resolver); every
// rule that isn't handed a config explicitly reads the current user's.
// Registered rather than imported so this file stays free of Node-only code:
// client components import the rule modules too.

let resolver: (() => EngineConfig | undefined) | null = null;
let missing: (() => EngineConfig) | null = null;

export function setConfigResolver(resolve: () => EngineConfig | undefined, onMissing: () => EngineConfig) {
  resolver = resolve;
  missing = onMissing;
}

/** The current user's config; the defaults in tests and in the browser. */
export function currentConfig(): EngineConfig {
  const found = resolver?.();
  if (found) return found;
  return missing ? missing() : DEFAULT_CONFIG;
}
