import { describe, expect, it } from "vitest";
import {
  getWalletProfile,
  listWalletProfiles,
  profileToWalletLimits
} from "./wallet-profiles.js";

describe("wallet profiles", () => {
  it("lists the five supported profiles", () => {
    expect(listWalletProfiles().map((profile) => profile.id)).toEqual([
      "conservative",
      "stable-only",
      "low-fee",
      "token-rotation-limited",
      "manual-only"
    ]);
  });

  it("maps a profile to wallet limits", () => {
    expect(profileToWalletLimits(getWalletProfile("conservative"))).toEqual({
      maxTradeUsd: "25",
      maxDailyTrades: 3,
      maxDailyLossUsd: "15",
      maxGasUsd: "3"
    });
  });
});
