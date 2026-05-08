import { describe, expect, it } from "vitest";
import { planDryRunTrade } from "./planner.js";
import type {
  DailyWalletStats,
  Pair,
  Router,
  Token,
  Wallet,
  WalletPairRule
} from "../db/schema.js";

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
  decimals: 6,
  riskLevel: "LOW",
  maxTradeUsd: null,
  enabled: true,
  createdAt: now,
  updatedAt: now
};

const pair: Pair = {
  id: "pair-1",
  chainId: 8453,
  tokenInId: "token-1",
  tokenOutId: "token-2",
  enabled: true,
  maxTradeUsd: "90",
  maxSlippageBps: 50,
  maxPriceImpactBps: 100,
  preferredRouter: "0x",
  fallbackRouter: null,
  createdAt: now,
  updatedAt: now
};

const rule: WalletPairRule = {
  id: "rule-1",
  walletId: "wallet-1",
  pairId: "pair-1",
  enabled: true,
  maxTradeUsd: "80",
  maxDailyTrades: 3,
  createdAt: now,
  updatedAt: now
};

const router: Router = {
  id: "router-1",
  chainId: 8453,
  name: "0x",
  address: null,
  enabled: true,
  riskLevel: "LOW",
  notes: null
};

const stats: DailyWalletStats = {
  id: "stats-1",
  walletId: "wallet-1",
  date: "2026-01-01",
  txCount: 0,
  gasSpentUsd: "0",
  estimatedLossUsd: "0",
  createdAt: now,
  updatedAt: now
};

describe("dry-run planner", () => {
  it("accepts a dry-run plan when all limits and allowlists pass", () => {
    const result = planDryRunTrade(
      {
        walletId: wallet.id,
        pairId: pair.id,
        amountIn: "50",
        mode: "DRY_RUN_ONLY"
      },
      {
        wallet,
        pair,
        walletPairRule: rule,
        tokenIn: token,
        tokenOut: { ...token, id: "token-2", symbol: "WETH" },
        routers: [router],
        dailyWalletStats: stats,
        dryRunEnabled: true
      }
    );

    expect(result.accepted).toBe(true);
    expect(result.txHash).toBeNull();
  });

  it("rejects inactive wallets and wallet-pair amount limit violations clearly", () => {
    const result = planDryRunTrade(
      {
        walletId: wallet.id,
        pairId: pair.id,
        amountIn: "85",
        mode: "DRY_RUN_ONLY"
      },
      {
        wallet: { ...wallet, status: "PAUSED" },
        pair,
        walletPairRule: rule,
        tokenIn: token,
        tokenOut: { ...token, id: "token-2", symbol: "WETH" },
        routers: [router],
        dailyWalletStats: stats,
        dryRunEnabled: true
      }
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Wallet status must be ACTIVE");
    expect(result.reasons).toContain(
      "Amount exceeds wallet-pair max trade limit"
    );
  });

  it("rejects unknown allowance targets returned by quote providers", () => {
    const result = planDryRunTrade(
      {
        walletId: wallet.id,
        pairId: pair.id,
        amountIn: "50",
        mode: "DRY_RUN_ONLY"
      },
      {
        wallet,
        pair,
        walletPairRule: rule,
        tokenIn: token,
        tokenOut: { ...token, id: "token-2", symbol: "WETH" },
        routers: [router],
        dailyWalletStats: stats,
        dryRunEnabled: true,
        quote: {
          provider: "zeroX",
          routerName: "0x",
          sellToken: "USDC",
          buyToken: "WETH",
          sellAmount: "50",
          buyAmount: "49",
          estimatedGas: {
            gasUsed: "180000",
            gasUsd: "2.50",
            feeNative: "0.0007"
          },
          allowanceTarget: "0x0000000000000000000000000000000000000999",
          txTo: null,
          txData: null,
          warnings: [],
          rawResponse: null
        }
      }
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Unknown allowance target");
  });
});
