/**
 * Every tunable number in the engine, in one place. The defaults are the
 * Day 1 agreement (see DECISIONS.md); per-user values will come from the
 * `settings` table and be merged over these.
 */
export interface EngineConfig {
  /** IANA zone that decides where a "day" starts and ends. */
  timeZone: string;
  xp: {
    /** Share of base XP paid when a task is done after its due time. */
    lateMultiplier: number;
    /** Share of base XP deducted when a need is ignored. */
    ignoredNeedPenalty: number;
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
  xp: {
    lateMultiplier: 0.5,
    ignoredNeedPenalty: 0.5,
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
