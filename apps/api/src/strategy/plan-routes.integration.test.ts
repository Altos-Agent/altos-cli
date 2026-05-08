import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { registerPlanRoutes } from "./plan-routes.js";

const originalDryRun = process.env.DRY_RUN;

const now = new Date("2026-01-01T00:00:00.000Z");

describe("dry-run plan integration", () => {
  afterEach(() => {
    process.env.DRY_RUN = originalDryRun;
  });

  it("creates a dry-run transaction through the HTTP route", async () => {
    process.env.DRY_RUN = "true";
    const { db, tables } = createInMemoryDb({
      wallets: [
        {
          id: "wallet-1",
          name: "Planner Wallet",
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
          decimals: 6,
          riskLevel: "LOW",
          maxTradeUsd: null,
          enabled: true,
          createdAt: now,
          updatedAt: now,
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
          updatedAt: now,
        },
      ],
      routers: [
        {
          id: "router-0x",
          chainId: 8453,
          name: "0x",
          address: null,
          enabled: true,
          riskLevel: "LOW",
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
    });
    const server = Fastify({ logger: false });
    await registerPlanRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/plans/dry-run",
      payload: {
        walletId: "wallet-1",
        pairId: "pair-1",
        amountIn: "25",
        mode: "DRY_RUN_ONLY",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("DRY_RUN");
    expect(body.accepted).toBe(true);
    expect(body.transactionId).toEqual(expect.any(String));
    expect(tables.transactions).toHaveLength(1);
    expect(tables.transactions[0]).toMatchObject({
      status: "DRY_RUN",
      action: "SWAP",
      walletId: "wallet-1",
      pairId: "pair-1",
      tokenIn: "USDC",
      tokenOut: "WETH",
    });

    await server.close();
  });
});
