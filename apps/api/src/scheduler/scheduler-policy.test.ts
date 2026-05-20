import { describe, expect, it } from "vitest";
import {
  canScheduleWallet,
  computeNextRunAt,
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
        dailyRunCount: 0,
        maxDailyRuns: 3,
        dailyLossUsd: 0,
        maxDailyLossUsd: 10,
        nonceStatus: "CLEAN"
      })
    ).toContain("Wallet schedule is disabled");

    expect(
      canScheduleWallet({
        scheduleEnabled: true,
        emergencyPaused: true,
        walletStatus: "ACTIVE",
        dailyRunCount: 0,
        maxDailyRuns: 3,
        dailyLossUsd: 0,
        maxDailyLossUsd: 10,
        nonceStatus: "CLEAN"
      })
    ).toContain("Wallet is emergency paused");
  });

  it("enforces daily trade and loss limits", () => {
    const reasons = canScheduleWallet({
      scheduleEnabled: true,
      emergencyPaused: false,
      walletStatus: "ACTIVE",
      dailyRunCount: 3,
      maxDailyRuns: 3,
      dailyLossUsd: 10,
      maxDailyLossUsd: 10,
      nonceStatus: "CLEAN"
    });

    expect(reasons).toContain("Wallet daily run limit reached");
    expect(reasons).toContain("Wallet daily loss threshold reached");
  });

  it("computes deterministic interval delay without randomization", () => {
    expect(nextRunDelayMs(15)).toBe(15 * 60 * 1000);
    expect(
      computeNextRunAt(new Date("2026-01-01T00:00:00.000Z"), 15)
    ).toEqual(new Date("2026-01-01T00:15:00.000Z"));
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
