export type StrategyProfile =
  | "MANUAL_ONLY"
  | "STABLE_ONLY"
  | "LOW_FEE_ONLY"
  | "TOKEN_ROTATION_LIMITED";

export interface SchedulePolicyInput {
  scheduleEnabled: boolean;
  emergencyPaused: boolean;
  walletStatus: "ACTIVE" | "PAUSED" | "DISABLED" | "QUARANTINED";
  dailyRunCount: number;
  maxDailyRuns: number | null;
  dailyLossUsd: number;
  maxDailyLossUsd: number | null;
  nonceStatus: "CLEAN" | "UNCERTAIN" | "QUARANTINED";
}

export const canScheduleWallet = (input: SchedulePolicyInput) => {
  const reasons: string[] = [];

  if (!input.scheduleEnabled) {
    reasons.push("Wallet schedule is disabled");
  }
  if (input.emergencyPaused) {
    reasons.push("Wallet is emergency paused");
  }
  if (input.walletStatus !== "ACTIVE") {
    reasons.push("Wallet status must be ACTIVE");
  }
  if (
    input.maxDailyRuns !== null &&
    input.dailyRunCount >= input.maxDailyRuns
  ) {
    reasons.push("Wallet daily run limit reached");
  }
  if (
    input.maxDailyLossUsd !== null &&
    input.dailyLossUsd >= input.maxDailyLossUsd
  ) {
    reasons.push("Wallet daily loss threshold reached");
  }
  if (input.nonceStatus === "QUARANTINED") {
    reasons.push("Wallet is quarantined due to nonce/tx issue");
  }
  if (input.nonceStatus === "UNCERTAIN") {
    reasons.push("Wallet nonce state is uncertain — requires operator review");
  }

  return reasons;
};

export const nextRunDelayMs = (minIntervalMinutes: number) =>
  Math.max(1, minIntervalMinutes) * 60 * 1000;

export const computeNextRunAt = (from: Date, minIntervalMinutes: number) =>
  new Date(from.getTime() + nextRunDelayMs(minIntervalMinutes));

export const shouldPauseWalletAfterFailure = ({
  recentFailedTxCount,
  failedTxThreshold
}: {
  recentFailedTxCount: number;
  failedTxThreshold: number | null;
}) =>
  failedTxThreshold !== null &&
  failedTxThreshold > 0 &&
  recentFailedTxCount >= failedTxThreshold;
