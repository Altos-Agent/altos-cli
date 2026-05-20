import { describe, expect, it } from "vitest";
import type { Pair, Router, Token } from "../db/schema.js";
import type { NormalizedQuote } from "../quote/types.js";
import {
  assertPairVerifiedForLive,
  assertQuoteTargetVerifiedForLive,
  assertRouterVerifiedForLive,
  assertSpenderVerifiedForLive,
  assertTokenVerifiedForLive,
} from "./verification.js";

const now = new Date("2026-01-01T00:00:00.000Z");

const verifiedEvidence = {
  verificationStatus: "VERIFIED" as const,
  verificationSource: "Basescan",
  verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000001",
  verifiedAt: now,
  verifiedBy: "operator",
  verificationNotes: "verified in test",
};

const token = (overrides: Partial<Token> = {}) =>
  ({
    id: "token-usdc",
    chainId: 8453,
    symbol: "USDC",
    name: "USD Coin",
    address: "0x0000000000000000000000000000000000000101",
    checksumAddress: "0x0000000000000000000000000000000000000101",
    decimals: 6,
    riskLevel: "LOW",
    maxTradeUsd: null,
    enabled: true,
    ...verifiedEvidence,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as Token;

const router = (overrides: Partial<Router> = {}) =>
  ({
    id: "router-0x",
    chainId: 8453,
    name: "0x",
    address: "0x0000000000000000000000000000000000000201",
    checksumAddress: "0x0000000000000000000000000000000000000201",
    spenderAddress: "0x0000000000000000000000000000000000000301",
    txTargetAddress: "0x0000000000000000000000000000000000000401",
    allowanceTargetAddress: "0x0000000000000000000000000000000000000301",
    functionSelectorAllowlist: { "0x": ["0x1fff991f"] },
    enabled: true,
    riskLevel: "LOW",
    ...verifiedEvidence,
    notes: null,
    ...overrides,
  }) as Router;

const pair = (overrides: Partial<Pair> = {}) =>
  ({
    id: "pair-1",
    chainId: 8453,
    tokenInId: "token-usdc",
    tokenOutId: "token-weth",
    enabled: true,
    maxTradeUsd: "100",
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
    preferredRouter: "0x",
    fallbackRouter: null,
    ...verifiedEvidence,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as Pair;

const quote = (overrides: Partial<NormalizedQuote> = {}) =>
  ({
    chainId: 8453,
    provider: "zeroX",
    routerName: "0x",
    routerAddress: "0x0000000000000000000000000000000000000201",
    spenderAddress: "0x0000000000000000000000000000000000000301",
    allowanceTarget: "0x0000000000000000000000000000000000000301",
    sellToken: "USDC",
    buyToken: "WETH",
    sellTokenAddress: "0x0000000000000000000000000000000000000101",
    buyTokenAddress: "0x0000000000000000000000000000000000000102",
    sellAmountDisplay: "10",
    sellAmountRaw: "10000000",
    buyAmountDisplay: "0.003",
    buyAmountRaw: "3000000000000000",
    sellAmountUsd: "10.00",
    buyAmountUsd: null,
    minBuyAmountRaw: "2900000000000000",
    estimatedGas: { gasUsed: "180000", gasUsd: "2.50", feeNative: "0.0007" },
    priceImpactBps: 50,
    slippageBps: 50,
    txTo: "0x0000000000000000000000000000000000000401",
    txData: "0x1fff991f00000000",
    txValue: "0",
    usdPriceSource: "test",
    usdPriceTimestamp: now,
    quoteUsdSource: "test",
    quotedAt: now,
    quoteTimestamp: now,
    expiresAt: new Date("2026-01-01T00:00:30.000Z"),
    warnings: [],
    rawResponse: null,
    ...overrides,
  }) as NormalizedQuote;

describe("verified registry live assertions", () => {
  it("rejects unverified, placeholder, and evidence-less tokens for live use", () => {
    expect(() => assertTokenVerifiedForLive(token())).not.toThrow();
    expect(() =>
      assertTokenVerifiedForLive(token({ verificationStatus: "UNVERIFIED" })),
    ).toThrow("Live execution requires VERIFIED");
    expect(() =>
      assertTokenVerifiedForLive(token({ verificationStatus: "PLACEHOLDER" })),
    ).toThrow("Live execution requires VERIFIED");
    expect(() =>
      assertTokenVerifiedForLive(token({ verificationEvidenceUrl: null })),
    ).toThrow("missing verification evidence");
  });

  it("requires verified router spender and exact allowance target match", () => {
    expect(() => assertRouterVerifiedForLive(router())).not.toThrow();
    expect(() =>
      assertSpenderVerifiedForLive({
        spenderAddress: "0x0000000000000000000000000000000000000999",
        router: router(),
      }),
    ).toThrow("does not match verified allowance target");
  });

  it("requires pair, both tokens, and quote target to be verified for live use", () => {
    expect(() =>
      assertPairVerifiedForLive({
        pair: pair(),
        tokenIn: token(),
        tokenOut: token({ id: "token-weth", symbol: "WETH" }),
      }),
    ).not.toThrow();
    expect(() =>
      assertQuoteTargetVerifiedForLive({
        quote: quote({ txTo: "0x0000000000000000000000000000000000000999" }),
        routers: [router()],
      }),
    ).toThrow("transaction target does not match");
  });
});
