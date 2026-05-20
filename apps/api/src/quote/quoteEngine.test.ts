import { describe, expect, it } from "vitest";
import { MockQuoteProvider } from "./providers/mock.js";
import { getQuote } from "./quoteEngine.js";
import type { Token, Wallet } from "../db/schema.js";

const now = new Date("2026-01-01T00:00:00.000Z");

const wallet: Wallet = {
  id: "wallet-1",
  name: "Primary",
  address: "0x0000000000000000000000000000000000000001",
  encryptedPrivateKey: "encrypted",
  encryptionVersion: 1,
  status: "ACTIVE",
  maxTradeUsd: "100",
  maxDailyTrades: 5,
  maxDailyLossUsd: "50",
  maxGasUsd: "5",
  notes: null,
  createdAt: now,
  updatedAt: now
};

const token: Token = {
  id: "token-1",
  chainId: 8453,
  symbol: "USDC",
  name: "USD Coin",
  address: "0x0000000000000000000000000000000000000002",
  checksumAddress: "0x0000000000000000000000000000000000000002",
  decimals: 6,
  riskLevel: "LOW",
  maxTradeUsd: null,
  enabled: true,
  verificationStatus: "VERIFIED",
  verificationSource: null,
  verificationEvidenceUrl: null,
  verifiedAt: null,
  verifiedBy: null,
  verificationNotes: null,
  createdAt: now,
  updatedAt: now
};

describe("quote engine", () => {
  it("uses the mock provider offline", async () => {
    const quote = await getQuote(
      {
        wallet,
        sellToken: token,
        buyToken: { ...token, id: "token-2", symbol: "WETH" },
        sellAmountDisplay: "10",
        sellAmountRaw: "10000000",
        routerName: "Mock Router"
      },
      new MockQuoteProvider()
    );

    expect(quote.provider).toBe("mock");
    expect(quote.sellAmountRaw).toBe("10000000");
    expect(quote.buyAmountRaw).toBe("9900000");
    expect(quote.txData).toBeNull();
  });
});
