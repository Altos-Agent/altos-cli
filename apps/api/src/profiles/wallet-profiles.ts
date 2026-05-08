import type { StrategyProfile } from "../scheduler/scheduler-policy.js";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type WalletProfileId =
  | "conservative"
  | "stable-only"
  | "low-fee"
  | "token-rotation-limited"
  | "manual-only";

export interface WalletProfile {
  id: WalletProfileId;
  name: string;
  maxTradeUsd: string;
  maxDailyTrades: number;
  maxDailyLossUsd: string;
  maxGasUsd: string;
  allowedRiskLevel: RiskLevel;
  defaultPairs: string[];
  scheduleDefaults: {
    enabled: boolean;
    tradeAmountUsd: string;
    minIntervalMinutes: number;
    maxDailyTrades: number;
    strategyProfile: StrategyProfile;
    failedTxPauseThreshold: number;
    emergencyPaused: boolean;
  };
}

const profiles: WalletProfile[] = [
  {
    id: "conservative",
    name: "Conservative",
    maxTradeUsd: "25",
    maxDailyTrades: 3,
    maxDailyLossUsd: "15",
    maxGasUsd: "3",
    allowedRiskLevel: "LOW",
    defaultPairs: ["USDC/WETH", "USDC/cbETH"],
    scheduleDefaults: {
      enabled: false,
      tradeAmountUsd: "10",
      minIntervalMinutes: 120,
      maxDailyTrades: 3,
      strategyProfile: "STABLE_ONLY",
      failedTxPauseThreshold: 2,
      emergencyPaused: false
    }
  },
  {
    id: "stable-only",
    name: "Stable Only",
    maxTradeUsd: "50",
    maxDailyTrades: 5,
    maxDailyLossUsd: "20",
    maxGasUsd: "4",
    allowedRiskLevel: "LOW",
    defaultPairs: ["USDC/EURC", "USDC/DAI"],
    scheduleDefaults: {
      enabled: false,
      tradeAmountUsd: "15",
      minIntervalMinutes: 90,
      maxDailyTrades: 5,
      strategyProfile: "STABLE_ONLY",
      failedTxPauseThreshold: 2,
      emergencyPaused: false
    }
  },
  {
    id: "low-fee",
    name: "Low Fee",
    maxTradeUsd: "40",
    maxDailyTrades: 4,
    maxDailyLossUsd: "15",
    maxGasUsd: "2",
    allowedRiskLevel: "LOW",
    defaultPairs: ["USDC/WETH"],
    scheduleDefaults: {
      enabled: false,
      tradeAmountUsd: "10",
      minIntervalMinutes: 120,
      maxDailyTrades: 4,
      strategyProfile: "LOW_FEE_ONLY",
      failedTxPauseThreshold: 2,
      emergencyPaused: false
    }
  },
  {
    id: "token-rotation-limited",
    name: "Token Rotation Limited",
    maxTradeUsd: "30",
    maxDailyTrades: 4,
    maxDailyLossUsd: "20",
    maxGasUsd: "4",
    allowedRiskLevel: "MEDIUM",
    defaultPairs: ["USDC/WETH", "USDC/cbETH", "USDC/AERO"],
    scheduleDefaults: {
      enabled: false,
      tradeAmountUsd: "10",
      minIntervalMinutes: 180,
      maxDailyTrades: 4,
      strategyProfile: "TOKEN_ROTATION_LIMITED",
      failedTxPauseThreshold: 2,
      emergencyPaused: false
    }
  },
  {
    id: "manual-only",
    name: "Manual Only",
    maxTradeUsd: "10",
    maxDailyTrades: 1,
    maxDailyLossUsd: "5",
    maxGasUsd: "2",
    allowedRiskLevel: "LOW",
    defaultPairs: [],
    scheduleDefaults: {
      enabled: false,
      tradeAmountUsd: "1",
      minIntervalMinutes: 1440,
      maxDailyTrades: 1,
      strategyProfile: "MANUAL_ONLY",
      failedTxPauseThreshold: 1,
      emergencyPaused: false
    }
  }
];

export const listWalletProfiles = () => profiles;

export const getWalletProfile = (id: WalletProfileId) => {
  const profile = profiles.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new Error("Unknown wallet profile");
  }

  return profile;
};

export const profileToWalletLimits = (profile: WalletProfile) => ({
  maxTradeUsd: profile.maxTradeUsd,
  maxDailyTrades: profile.maxDailyTrades,
  maxDailyLossUsd: profile.maxDailyLossUsd,
  maxGasUsd: profile.maxGasUsd
});
