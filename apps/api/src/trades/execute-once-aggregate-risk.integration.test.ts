import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb, type InMemoryTables } from "../test-utils/in-memory-db.js";
import { unlockVault, lockVault } from "../vault/vault-lock.js";
import { registerTradeRoutes } from "./trade-routes.js";
import type * as WalletVaultModule from "../vault/wallet-vault.js";

const walletVaultMocks = vi.hoisted(() => ({
  decryptPrivateKey: vi.fn(),
  loadOrCreateMasterKey: vi.fn(),
}));

vi.mock("../vault/wallet-vault.js", async () => {
  const actual = await vi.importActual<typeof WalletVaultModule>(
    "../vault/wallet-vault.js"
  );
  return {
    ...actual,
    loadOrCreateMasterKey: walletVaultMocks.loadOrCreateMasterKey,
    decryptPrivateKey: walletVaultMocks.decryptPrivateKey,
  };
});

vi.mock("../blockchain/baseClient.js", () => ({
  baseMainnet: { id: 8453, name: "Base" },
  basePublicClient: {
    readContract: vi.fn(async () => 1000000000000000000000000n),
    call: vi.fn(async () => "0x"),
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
  },
}));

vi.mock("../quote/quoteEngine.js", () => ({
  getQuote: vi.fn(async () => {
    const now = new Date();
    return {
      chainId: 8453,
      provider: "zeroX",
      routerName: "0x",
      routerAddress: "0x0000000000000000000000000000000000000004",
      spenderAddress: "0x0000000000000000000000000000000000000004",
      allowanceTarget: "0x0000000000000000000000000000000000000004",
      sellToken: "USDC",
      buyToken: "WETH",
      sellTokenAddress: "0x0000000000000000000000000000000000000002",
      buyTokenAddress: "0x0000000000000000000000000000000000000003",
      sellAmountDisplay: "20",
      sellAmountRaw: "20000000",
      buyAmountDisplay: "0.005",
      buyAmountRaw: "5000000000000000",
      sellAmountUsd: "20.00",
      buyAmountUsd: null,
      minBuyAmountRaw: "4900000000000000",
      estimatedGas: {
        gasUsed: "180000",
        gasUsd: "1.00",
        feeNative: "0.0003",
      },
      priceImpactBps: 10,
      slippageBps: 50,
      txTo: "0x0000000000000000000000000000000000000004",
      txData: "0xabcdef",
      txValue: "0",
      usdPriceSource: "test",
      usdPriceTimestamp: now,
      quoteUsdSource: "test",
      quotedAt: now,
      quoteTimestamp: now,
      expiresAt: new Date(now.getTime() + 30_000),
      warnings: [],
      rawResponse: null,
    };
  }),
}));

const originalEnv = { ...process.env };
const now = new Date("2026-01-01T00:00:00.000Z");

const applyLiveEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.BASE_CHAIN_ID = "8453";
  process.env.BASE_RPC_URL = "https://mainnet.base.org";
  process.env.BASESCAN_BASE_URL = "https://basescan.org";
  process.env.DRY_RUN = "false";
  process.env.DEMO_MODE = "false";
  process.env.REQUIRE_LIVE_CONFIRMATION = "true";
  process.env.ALLOW_UNLIMITED_APPROVAL = "false";
  process.env.AUTO_APPROVE = "false";
  process.env.SCHEDULER_LIVE_EXECUTION = "false";
  process.env.QUOTE_PROVIDER = "zeroX";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.DATABASE_URL =
    "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator";
  process.env.OPERATOR_USERNAME = "operator";
  process.env.OPERATOR_PASSWORD = "local-password";
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.VAULT_UNLOCK_PASSPHRASE = "test-unlock";
};

const seed: Partial<InMemoryTables> = {
  aggregateRiskLimits: [
    {
      id: "limits-1",
      chainId: 8453,
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "10",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 5,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  wallets: [
    {
      id: "wallet-1",
      name: "Live Guard Wallet",
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
      updatedAt: now,
    },
  ],
  tokens: [
    {
      id: "token-usdc",
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
      verificationSource: "test",
      verificationEvidenceUrl: "https://basescan.org/token/0x0000000000000000000000000000000000000002",
      verifiedAt: now,
      verifiedBy: "test",
      verificationNotes: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "token-weth",
      chainId: 8453,
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x0000000000000000000000000000000000000003",
      checksumAddress: "0x0000000000000000000000000000000000000003",
      decimals: 18,
      riskLevel: "LOW",
      maxTradeUsd: null,
      enabled: true,
      verificationStatus: "VERIFIED",
      verificationSource: "test",
      verificationEvidenceUrl: "https://basescan.org/token/0x0000000000000000000000000000000000000003",
      verifiedAt: now,
      verifiedBy: "test",
      verificationNotes: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  routers: [
    {
      id: "router-0x",
      chainId: 8453,
      name: "0x",
      address: "0x0000000000000000000000000000000000000004",
      checksumAddress: "0x0000000000000000000000000000000000000004",
      spenderAddress: "0x0000000000000000000000000000000000000004",
      txTargetAddress: "0x0000000000000000000000000000000000000004",
      allowanceTargetAddress: "0x0000000000000000000000000000000000000004",
      functionSelectorAllowlist: null,
      enabled: true,
      riskLevel: "LOW",
      verificationStatus: "VERIFIED",
      verificationSource: "test",
      verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000004",
      verifiedAt: now,
      verifiedBy: "test",
      verificationNotes: null,
      notes: null,
    },
  ],
  pairs: [
    {
      id: "pair-1",
      chainId: 8453,
      tokenInId: "token-usdc",
      tokenOutId: "token-weth",
      enabled: true,
      maxTradeUsd: "90",
      maxSlippageBps: 50,
      maxPriceImpactBps: 100,
      preferredRouter: "0x",
      fallbackRouter: null,
      verificationStatus: "VERIFIED",
      verificationSource: "test",
      verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000004",
      verifiedAt: now,
      verifiedBy: "test",
      verificationNotes: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  walletPairRules: [
    {
      id: "rule-1",
      walletId: "wallet-1",
      pairId: "pair-1",
      enabled: true,
      maxTradeUsd: "80",
      maxDailyTrades: 3,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

describe("execute-once aggregate risk gate", () => {
  beforeEach(async () => {
    applyLiveEnv();
    walletVaultMocks.decryptPrivateKey.mockReset();
    walletVaultMocks.loadOrCreateMasterKey.mockReset();
    await unlockVault({ passphrase: "test-unlock" });
  });

  afterEach(() => {
    lockVault();
    process.env = { ...originalEnv };
  });

  it("rejects before wallet key decryption when aggregate pending cap would be breached", async () => {
    const { db, tables } = createInMemoryDb(seed);
    const server = Fastify({ logger: false });
    await registerTradeRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "aggregate-risk-fail" },
      payload: {
        walletId: "wallet-1",
        pairId: "pair-1",
        sellAmountDisplay: "20",
        confirmLiveExecution: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: false,
      rejected: true,
      status: "REJECTED",
      codes: ["AGGREGATE_PENDING_TRADE_LIMIT_EXCEEDED"],
    });
    expect(walletVaultMocks.decryptPrivateKey).not.toHaveBeenCalled();
    expect(walletVaultMocks.loadOrCreateMasterKey).not.toHaveBeenCalled();
    expect(tables.transactions[0]).toMatchObject({
      status: "REJECTED",
      amountInRaw: "20000000",
      amountInUsd: "20.00",
      riskCheckedAt: expect.any(Date),
    });
    expect(tables.transactions[0]?.aggregateRiskSnapshotJson).toMatchObject({
      allowed: false,
      codes: ["AGGREGATE_PENDING_TRADE_LIMIT_EXCEEDED"],
      proposedTradeUsd: "20.00",
    });

    await server.close();
  });

  it("rejects execute-once before signing when quote target is not VERIFIED", async () => {
    const unverifiedSeed: Partial<InMemoryTables> = {
      ...seed,
      aggregateRiskLimits: [
        {
          ...(seed.aggregateRiskLimits?.[0] as Record<string, unknown>),
          maxPendingTradeUsd: "1000",
        },
      ],
      routers: [
        {
          ...(seed.routers?.[0] as Record<string, unknown>),
          verificationStatus: "UNVERIFIED",
        },
      ],
    };
    const { db } = createInMemoryDb(unverifiedSeed);
    const server = Fastify({ logger: false });
    await registerTradeRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "unverified-quote-target" },
      payload: {
        walletId: "wallet-1",
        pairId: "pair-1",
        sellAmountDisplay: "20",
        confirmLiveExecution: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: false,
      rejected: true,
    });
    expect(response.json().reasons).toContain(
      "Quote transaction target is not verified",
    );
    expect(walletVaultMocks.decryptPrivateKey).not.toHaveBeenCalled();
    expect(walletVaultMocks.loadOrCreateMasterKey).not.toHaveBeenCalled();

    await server.close();
  });
});
