import { describe, expect, it } from "vitest";
import {
  canScheduleWallet,
  nextRunDelayMs,
  shouldPauseWalletAfterFailure
} from "./scheduler-policy.js";

describe("scheduler policy", () => {
  it("refuses disabled schedules and emergency paused wallets", () => {
    expect(
      canScheduleWallet({
        scheduleEnabled: false,
        emergencyPaused: false,
        walletStatus: "ACTIVE",
        dailyTxCount: 0,
        maxDailyTrades: 3,
        dailyLossUsd: 0,
        maxDailyLossUsd: 10
      })
    ).toContain("Wallet schedule is disabled");

    expect(
      canScheduleWallet({
        scheduleEnabled: true,
        emergencyPaused: true,
        walletStatus: "ACTIVE",
        dailyTxCount: 0,
        maxDailyTrades: 3,
        dailyLossUsd: 0,
        maxDailyLossUsd: 10
      })
    ).toContain("Wallet is emergency paused");
  });

  it("enforces daily trade and loss limits", () => {
    const reasons = canScheduleWallet({
      scheduleEnabled: true,
      emergencyPaused: false,
      walletStatus: "ACTIVE",
      dailyTxCount: 3,
      maxDailyTrades: 3,
      dailyLossUsd: 10,
      maxDailyLossUsd: 10
    });

    expect(reasons).toContain("Wallet daily trade limit reached");
    expect(reasons).toContain("Wallet daily loss threshold reached");
  });

  it("computes deterministic interval delay without randomization", () => {
    expect(nextRunDelayMs(15)).toBe(15 * 60 * 1000);
  });

  it("pauses after configured failed transaction threshold", () => {
    expect(
      shouldPauseWalletAfterFailure({
        recentFailedTxCount: 2,
        failedTxThreshold: 2
      })
    ).toBe(true);
  });
});
