import { describe, expect, it } from "vitest";
import { evaluateLiveExecutionSafety } from "./live-execution.js";
import type { Router } from "../db/schema.js";
import type { NormalizedQuote } from "../quote/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

const router: Router = {
  id: "router-1",
  chainId: 8453,
  name: "0x",
  address: "0x0000000000000000000000000000000000000001",
  checksumAddress: "0x0000000000000000000000000000000000000001",
  spenderAddress: "0x0000000000000000000000000000000000000001",
  txTargetAddress: "0x0000000000000000000000000000000000000001",
  allowanceTargetAddress: "0x0000000000000000000000000000000000000001",
  functionSelectorAllowlist: null,
  enabled: true,
  riskLevel: "LOW",
  verificationStatus: "VERIFIED",
  verificationSource: null,
  verificationEvidenceUrl: null,
  verifiedAt: null,
  verifiedBy: null,
  verificationNotes: null,
  notes: null,
};

const quote: NormalizedQuote = {
  chainId: 8453,
  provider: "zeroX",
  routerName: "0x",
  routerAddress: router.address,
  spenderAddress: router.address,
  sellToken: "USDC",
  buyToken: "WETH",
  sellTokenAddress: "0x0000000000000000000000000000000000000101",
  buyTokenAddress: "0x0000000000000000000000000000000000000102",
  sellAmountDisplay: "10",
  sellAmountRaw: "10000000",
  buyAmountDisplay: "9",
  buyAmountRaw: "9000000",
  sellAmountUsd: "10.00",
  buyAmountUsd: null,
  minBuyAmountRaw: "8900000",
  estimatedGas: {
    gasUsed: "180000",
    gasUsd: "2.50",
    feeNative: "0.0007",
  },
  allowanceTarget: router.address,
  txTo: router.address,
  txData: "0xabcdef",
  priceImpactBps: null,
  slippageBps: 100,
  txValue: "0",
  usdPriceSource: "test",
  usdPriceTimestamp: now,
  quoteUsdSource: "test",
  quotedAt: now,
  quoteTimestamp: now,
  expiresAt: new Date("2026-01-01T00:00:30.000Z"),
  warnings: [],
  rawResponse: null,
};

describe("live execution safety", () => {
  it("rejects live execution while global dry-run mode is enabled", () => {
    const result = evaluateLiveExecutionSafety({
      dryRunEnabled: true,
      requireLiveConfirmation: true,
      confirmLiveExecution: true,
      riskAccepted: true,
      riskReasons: [],
      quote,
      routers: [router],
      simulated: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Global DRY_RUN must be false");
  });

  it("rejects live execution while demo mode is enabled", () => {
    const result = evaluateLiveExecutionSafety({
      demoMode: true,
      dryRunEnabled: false,
      requireLiveConfirmation: true,
      confirmLiveExecution: true,
      riskAccepted: true,
      riskReasons: [],
      quote,
      routers: [router],
      simulated: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Demo mode blocks live execution");
  });

  it("rejects missing request confirmation when server confirmation is required", () => {
    const result = evaluateLiveExecutionSafety({
      dryRunEnabled: false,
      requireLiveConfirmation: true,
      confirmLiveExecution: false,
      riskAccepted: true,
      riskReasons: [],
      quote,
      routers: [router],
      simulated: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Live execution confirmation is required");
  });

  it("rejects quotes that do not contain a sendable transaction", () => {
    const result = evaluateLiveExecutionSafety({
      dryRunEnabled: false,
      requireLiveConfirmation: true,
      confirmLiveExecution: true,
      riskAccepted: true,
      riskReasons: [],
      quote: { ...quote, txTo: null, txData: null },
      routers: [router],
      simulated: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain(
      "Quote does not include a transaction target",
    );
    expect(result.reasons).toContain("Quote does not include transaction data");
  });

  it("accepts only when confirmation, risk, quote, target, and simulation pass", () => {
    const result = evaluateLiveExecutionSafety({
      dryRunEnabled: false,
      requireLiveConfirmation: true,
      confirmLiveExecution: true,
      riskAccepted: true,
      riskReasons: [],
      quote,
      routers: [router],
      simulated: true,
      now,
    });

    expect(result).toEqual({
      accepted: true,
      rejected: false,
      reasons: [],
    });
  });
});
