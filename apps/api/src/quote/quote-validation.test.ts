import { describe, expect, it } from "vitest";
import type { Pair, Router, Token, Wallet } from "../db/schema.js";
import type { NormalizedQuote } from "./types.js";
import { validateQuoteForExecution } from "./quote-validation.js";

const now = new Date("2026-01-01T00:00:10.000Z");

const wallet = {
  id: "wallet-1",
  address: "0x0000000000000000000000000000000000000aaa",
} as Wallet;

const sellToken = {
  id: "token-usdc",
  chainId: 8453,
  symbol: "USDC",
  address: "0x0000000000000000000000000000000000000101",
  checksumAddress: "0x0000000000000000000000000000000000000101",
  decimals: 6,
  enabled: true,
  verificationStatus: "VERIFIED",
  verificationSource: "Basescan",
  verificationEvidenceUrl: "https://basescan.org/token/0x0000000000000000000000000000000000000101",
  verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  verifiedBy: "test",
  verificationNotes: "test",
} as Token;

const buyToken = {
  id: "token-weth",
  chainId: 8453,
  symbol: "WETH",
  address: "0x0000000000000000000000000000000000000102",
  checksumAddress: "0x0000000000000000000000000000000000000102",
  decimals: 18,
  enabled: true,
  verificationStatus: "VERIFIED",
  verificationSource: "Basescan",
  verificationEvidenceUrl: "https://basescan.org/token/0x0000000000000000000000000000000000000102",
  verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  verifiedBy: "test",
  verificationNotes: "test",
} as Token;

const pair = {
  id: "pair-1",
  chainId: 8453,
  tokenInId: sellToken.id,
  tokenOutId: buyToken.id,
  enabled: true,
  maxSlippageBps: 100,
  maxPriceImpactBps: 200,
  verificationStatus: "VERIFIED",
  verificationSource: "operator",
  verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000201",
  verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  verifiedBy: "test",
  verificationNotes: "test",
} as Pair;

const router = {
  id: "router-1",
  chainId: 8453,
  name: "0x",
  address: "0x0000000000000000000000000000000000000201",
  enabled: true,
  verificationStatus: "VERIFIED",
  verificationSource: "0x docs",
  verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000201",
  verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  verifiedBy: "test",
  verificationNotes: "test",
} as Router;

const quote = (overrides: Partial<NormalizedQuote> = {}): NormalizedQuote => ({
  chainId: 8453,
  provider: "zeroX",
  routerName: "0x",
  routerAddress: router.address,
  spenderAddress: router.address,
  allowanceTarget: router.address,
  sellToken: "USDC",
  buyToken: "WETH",
  sellTokenAddress: sellToken.address,
  buyTokenAddress: buyToken.address,
  sellAmountDisplay: "10",
  sellAmountRaw: "10000000",
  buyAmountDisplay: "0.003",
  buyAmountRaw: "3000000000000000",
  sellAmountUsd: "10.00",
  buyAmountUsd: null,
  minBuyAmountRaw: "2900000000000000",
  estimatedGas: {
    gasUsed: "180000",
    gasUsd: "2.50",
    feeNative: "0.0007",
  },
  priceImpactBps: 50,
  slippageBps: 50,
  txTo: router.address,
  txData: "0x1fff991f00000000",
  txValue: "0",
  usdPriceSource: "test",
  usdPriceTimestamp: new Date("2026-01-01T00:00:00.000Z"),
  quoteUsdSource: "test",
  quotedAt: new Date("2026-01-01T00:00:00.000Z"),
  quoteTimestamp: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-01-01T00:00:30.000Z"),
  warnings: [],
  rawResponse: null,
  ...overrides,
});

const validate = (input: Partial<NormalizedQuote> = {}) =>
  validateQuoteForExecution({
    quote: quote(input),
    wallet,
    pair,
    sellToken,
    buyToken,
    sellAmountRaw: "10000000",
    routers: [router],
    live: true,
    now,
  });

describe("quote execution validation", () => {
  it.each([
    [{ chainId: 1 }, "Quote chainId must be 8453"],
    [{ routerAddress: "0x0000000000000000000000000000000000000999" }, "Quote router is not enabled"],
    [{ spenderAddress: "0x0000000000000000000000000000000000000999", allowanceTarget: "0x0000000000000000000000000000000000000999" }, "Quote spender is not verified"],
    [{ sellTokenAddress: buyToken.address }, "Quote sell token does not match the pair"],
    [{ buyTokenAddress: sellToken.address }, "Quote buy token does not match the pair"],
    [{ sellAmountRaw: "9999999" }, "Quote sell amount does not match the request"],
    [{ txTo: "0x0000000000000000000000000000000000000999" }, "Quote transaction target is not verified"],
    [{ txData: null }, "Quote transaction data is required for live execution"],
    [{ txValue: "1" }, "Native value swaps are disabled"],
    [{ expiresAt: new Date("2026-01-01T00:00:09.000Z") }, "Quote is stale or expired"],
    [{ priceImpactBps: 250 }, "Price impact exceeds max price impact of 200 bps"],
    [{ slippageBps: 150 }, "Slippage exceeds max slippage of 100 bps"],
    [{ buyAmountRaw: "0" }, "Quote buy amount must be greater than zero"],
  ])("rejects invalid quote field %#", (overrides, reason) => {
    expect(validate(overrides).reasons).toContain(reason);
  });

  it("enforces function selector allowlists when configured for a router", () => {
    const result = validateQuoteForExecution({
      quote: quote({ txData: "0xdeadbeef00000000" }),
      wallet,
      pair,
      sellToken,
      buyToken,
      sellAmountRaw: "10000000",
      routers: [router],
      live: true,
      now,
      functionSelectorAllowlist: {
        "0x": ["0x1fff991f"],
      },
    });

    expect(result.reasons).toContain("Quote calldata function selector is not allowed for router");
  });

  it("accepts a fresh quote that matches the wallet, pair, router, amount, and value policy", () => {
    expect(validate()).toEqual({
      accepted: true,
      rejected: false,
      reasons: [],
    });
  });
});
