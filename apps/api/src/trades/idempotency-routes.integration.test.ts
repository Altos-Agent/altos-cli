import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryDb, type InMemoryTables } from "../test-utils/in-memory-db.js";
import { registerApprovalRoutes } from "../approvals/approval-routes.js";
import { registerTradeRoutes } from "./trade-routes.js";

const originalEnv = { ...process.env };
const now = new Date("2026-01-01T00:00:00.000Z");

const applyEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.BASE_CHAIN_ID = "8453";
  process.env.BASE_RPC_URL = "https://mainnet.base.org";
  process.env.BASESCAN_BASE_URL = "https://basescan.org";
  process.env.DRY_RUN = "true";
  process.env.DEMO_MODE = "true";
  process.env.REQUIRE_LIVE_CONFIRMATION = "true";
  process.env.ALLOW_UNLIMITED_APPROVAL = "false";
  process.env.AUTO_APPROVE = "false";
  process.env.SCHEDULER_LIVE_EXECUTION = "false";
  process.env.QUOTE_PROVIDER = "mock";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.DATABASE_URL =
    "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator";
  process.env.OPERATOR_USERNAME = "operator";
  process.env.OPERATOR_PASSWORD = "local-password";
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
};

const seed: Partial<InMemoryTables> = {
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
      updatedAt: now
    }
  ],
  tokens: [
    {
      id: "token-usdc",
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
    },
    {
      id: "token-weth",
      chainId: 8453,
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x0000000000000000000000000000000000000003",
      decimals: 18,
      riskLevel: "LOW",
      maxTradeUsd: null,
      enabled: true,
      createdAt: now,
      updatedAt: now
    }
  ],
  routers: [
    {
      id: "router-0x",
      chainId: 8453,
      name: "0x",
      address: "0x0000000000000000000000000000000000000004",
      enabled: true,
      riskLevel: "LOW",
      notes: null
    }
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
      createdAt: now,
      updatedAt: now
    }
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
      updatedAt: now
    }
  ]
};

describe("live-impacting route idempotency", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns the same rejected execute-once transaction for duplicate idempotency requests", async () => {
    applyEnv();
    const { db, tables } = createInMemoryDb(seed);
    const server = Fastify({ logger: false });
    await registerTradeRoutes(server, db as never);
    const payload = {
      walletId: "wallet-1",
      pairId: "pair-1",
      sellAmountDisplay: "5",
      confirmLiveExecution: true
    };

    const first = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "execute-key-1" },
      payload
    });
    const second = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "execute-key-1" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().transactionId).toBe(first.json().transactionId);
    expect(tables.transactionRequests).toHaveLength(1);
    expect(tables.pendingWalletLocks[0]).toMatchObject({
      walletId: "wallet-1",
      status: "RELEASED"
    });
    await server.close();
  });

  it("rejects duplicate idempotency keys with different execute payloads", async () => {
    applyEnv();
    const { db } = createInMemoryDb(seed);
    const server = Fastify({ logger: false });
    await registerTradeRoutes(server, db as never);
    const basePayload = {
      walletId: "wallet-1",
      pairId: "pair-1",
      confirmLiveExecution: true
    };

    await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "execute-key-conflict" },
      payload: { ...basePayload, sellAmountDisplay: "5" }
    });
    const conflict = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: { "idempotency-key": "execute-key-conflict" },
      payload: { ...basePayload, sellAmountDisplay: "6" }
    });

    expect(conflict.statusCode).toBe(409);
    await server.close();
  });

  it("requires idempotency keys for approval and revoke routes", async () => {
    applyEnv();
    const { db } = createInMemoryDb(seed);
    const server = Fastify({ logger: false });
    await registerApprovalRoutes(server, db as never);

    const approve = await server.inject({
      method: "POST",
      url: "/api/wallets/wallet-1/approve",
      payload: {
        tokenId: "token-usdc",
        routerId: "router-0x",
        amount: "1",
        confirmLiveExecution: true
      }
    });
    const revoke = await server.inject({
      method: "POST",
      url: "/api/wallets/wallet-1/revoke",
      payload: {
        tokenId: "token-usdc",
        routerId: "router-0x",
        confirmLiveExecution: true
      }
    });

    expect(approve.statusCode).toBe(400);
    expect(approve.json().error).toBe("Idempotency-Key header is required");
    expect(revoke.statusCode).toBe(400);
    expect(revoke.json().error).toBe("Idempotency-Key header is required");
    await server.close();
  });
});
