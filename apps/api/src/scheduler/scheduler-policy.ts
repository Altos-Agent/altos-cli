export type StrategyProfile =
  | "MANUAL_ONLY"
  | "STABLE_ONLY"
  | "LOW_FEE_ONLY"
  | "TOKEN_ROTATION_LIMITED";

export interface SchedulePolicyInput {
  scheduleEnabled: boolean;
  emergencyPaused: boolean;
  walletStatus: "ACTIVE" | "PAUSED" | "DISABLED";
  dailyTxCount: number;
  maxDailyTrades: number | null;
  dailyLossUsd: number;
  maxDailyLossUsd: number | null;
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
    input.maxDailyTrades !== null &&
    input.dailyTxCount >= input.maxDailyTrades
  ) {
    reasons.push("Wallet daily trade limit reached");
  }
  if (
    input.maxDailyLossUsd !== null &&
    input.dailyLossUsd >= input.maxDailyLossUsd
  ) {
    reasons.push("Wallet daily loss threshold reached");
  }

  return reasons;
};

export const nextRunDelayMs = (minIntervalMinutes: number) =>
  Math.max(1, minIntervalMinutes) * 60 * 1000;

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
