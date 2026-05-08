import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerChainRoutes } from "../blockchain/chain-routes.js";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

describe("transaction history link integration", () => {
  it("generates a Basescan link for transaction history rows with a hash", async () => {
    const txHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    const { db } = createInMemoryDb({
      transactions: [
        {
          id: "tx-1",
          walletId: "wallet-1",
          pairId: null,
          chainId: 8453,
          txHash,
          status: "SUBMITTED",
          action: "SWAP",
          router: "0x",
          tokenIn: "USDC",
          tokenOut: "WETH",
          amountIn: "1000000",
          amountOut: null,
          gasUsed: null,
          gasUsd: null,
          feeNative: null,
          errorMessage: null,
          basescanUrl: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const server = Fastify({ logger: false });
    await registerChainRoutes(server, db as never);

    const response = await server.inject({
      method: "GET",
      url: "/api/transactions/tx-1/basescan",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transactionId: "tx-1",
      txHash,
      basescanUrl: `https://basescan.org/tx/${txHash}`,
    });

    await server.close();
  });
});
