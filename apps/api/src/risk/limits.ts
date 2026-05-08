export interface LimitCheckInput {
  amountUsd: number;
  walletMaxTradeUsd: string | null;
  pairMaxTradeUsd: string | null;
  walletPairMaxTradeUsd: string | null;
  walletMaxDailyTrades: number | null;
  dailyTxCount: number;
  walletMaxDailyLossUsd: string | null;
  dailyEstimatedLossUsd: string | null;
}

const parseOptionalLimit = (value: string | null) =>
  value === null ? null : Number(value);

export const checkTradeLimits = (input: LimitCheckInput): string[] => {
  const reasons: string[] = [];
  const walletMaxTradeUsd = parseOptionalLimit(input.walletMaxTradeUsd);
  const pairMaxTradeUsd = parseOptionalLimit(input.pairMaxTradeUsd);
  const walletPairMaxTradeUsd = parseOptionalLimit(input.walletPairMaxTradeUsd);
  const walletMaxDailyLossUsd = parseOptionalLimit(input.walletMaxDailyLossUsd);
  const dailyEstimatedLossUsd = parseOptionalLimit(input.dailyEstimatedLossUsd);

  if (input.amountUsd <= 0 || !Number.isFinite(input.amountUsd)) {
    reasons.push("Amount must be a positive number");
  }
  if (walletMaxTradeUsd !== null && input.amountUsd > walletMaxTradeUsd) {
    reasons.push("Amount exceeds wallet max trade limit");
  }
  if (pairMaxTradeUsd !== null && input.amountUsd > pairMaxTradeUsd) {
    reasons.push("Amount exceeds pair max trade limit");
  }
  if (
    walletPairMaxTradeUsd !== null &&
    input.amountUsd > walletPairMaxTradeUsd
  ) {
    reasons.push("Amount exceeds wallet-pair max trade limit");
  }
  if (
    input.walletMaxDailyTrades !== null &&
    input.dailyTxCount >= input.walletMaxDailyTrades
  ) {
    reasons.push("Daily transaction count exceeds wallet limit");
  }
  if (
    walletMaxDailyLossUsd !== null &&
    dailyEstimatedLossUsd !== null &&
    dailyEstimatedLossUsd >= walletMaxDailyLossUsd
  ) {
    reasons.push("Daily estimated loss exceeds wallet limit");
  }

  return reasons;
};
