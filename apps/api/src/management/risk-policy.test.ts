import { describe, expect, it } from "vitest";
import {
  assertHighRiskTokenPolicy,
  assertPairEnablePolicy,
  assertWalletPairRulePolicy,
  defaultMaxSlippageBps,
} from "./risk-policy.js";

describe("risk policy", () => {
  it("uses a conservative default max slippage", () => {
    expect(defaultMaxSlippageBps).toBeLessThanOrEqual(50);
  });

  it("requires high-risk tokens to have an explicit max trade size before enabling", () => {
    expect(() =>
      assertHighRiskTokenPolicy({
        enabled: true,
        riskLevel: "HIGH",
        maxTradeUsd: null,
      }),
    ).toThrow("High-risk tokens require a max trade size");
  });

  it("rejects enabling pairs when either token is disabled", () => {
    expect(() =>
      assertPairEnablePolicy({
        tokenInEnabled: true,
        tokenOutEnabled: false,
        tokenInRiskLevel: "LOW",
        tokenOutRiskLevel: "LOW",
        maxTradeUsd: "100",
        preferredRouterEnabled: true,
        fallbackRouterEnabled: true,
      }),
    ).toThrow("Pairs may only use enabled tokens");
  });

  it("rejects enabling pairs when a configured router is disabled", () => {
    expect(() =>
      assertPairEnablePolicy({
        tokenInEnabled: true,
        tokenOutEnabled: true,
        tokenInRiskLevel: "LOW",
        tokenOutRiskLevel: "LOW",
        maxTradeUsd: "100",
        preferredRouterEnabled: true,
        fallbackRouterEnabled: false,
      }),
    ).toThrow("Pairs may only use enabled routers");
  });

  it("requires high-risk pairs and wallet-pair rules to carry explicit trade limits", () => {
    expect(() =>
      assertPairEnablePolicy({
        tokenInEnabled: true,
        tokenOutEnabled: true,
        tokenInRiskLevel: "HIGH",
        tokenOutRiskLevel: "LOW",
        maxTradeUsd: null,
        preferredRouterEnabled: true,
        fallbackRouterEnabled: true,
      }),
    ).toThrow("Pairs containing high-risk tokens require a max trade size");

    expect(() =>
      assertWalletPairRulePolicy({
        enabled: true,
        pairEnabled: true,
        maxTradeUsd: null,
      }),
    ).toThrow(
      "Enabled wallet pair rules require a wallet-specific max trade size",
    );
  });
});
