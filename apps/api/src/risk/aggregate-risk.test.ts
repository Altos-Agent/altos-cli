import { describe, expect, it } from "vitest";
import {
  AGGREGATE_RISK_CODES,
  checkAggregateRisk,
  createAggregateRiskSnapshot,
} from "./aggregate-risk.js";
import type { DbClient } from "../db/client.js";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

// Minimal mock that properly chains drizzle ORM calls
const createMockDb = (limitsResult: unknown[], statsResult: unknown[], pendingResult: unknown[]) => {
  let callCount = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          callCount++;
          if (callCount === 1) return Promise.resolve(limitsResult);
          if (callCount === 2) return Promise.resolve(statsResult);
          return Promise.resolve(pendingResult);
        },
      }),
    }),
  } as unknown as DbClient;
  return { db, getCallCount: () => callCount };
};

describe("aggregate risk", () => {
  it("allows plan when all limits pass", async () => {
    const limits = {
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "500",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 3,
      enabled: true,
    };
    const { db } = createMockDb([limits], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ walletCount: 0 }]);

    const result = await checkAggregateRisk(db, 50, 5);
    expect(result.allowed).toBe(true);
  });

  it("rejects plan over daily trade cap", async () => {
    const limits = {
      maxDailyTradeUsd: "100",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "500",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 3,
      enabled: true,
    };
    const { db } = createMockDb([limits], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ walletCount: 0 }]);

    const result = await checkAggregateRisk(db, 900, 5);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("daily trade cap"))).toBe(true);
  });

  it("rejects plan over daily gas cap", async () => {
    const limits = {
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "10",
      maxPendingTradeUsd: "500",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 3,
      enabled: true,
    };
    const { db } = createMockDb([limits], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ walletCount: 0 }]);

    const result = await checkAggregateRisk(db, 10, 90);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("daily gas cap"))).toBe(true);
  });

  it("rejects plan over pending trade cap", async () => {
    const limits = {
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "50",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 3,
      enabled: true,
    };
    const { db } = createMockDb([limits], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ totalUsd: "40", walletCount: 1 }]);

    const result = await checkAggregateRisk(db, 30, 5);
    expect(result.allowed).toBe(false);
    expect(result.codes).toContain(
      AGGREGATE_RISK_CODES.pendingTradeLimitExceeded
    );
  });

  it("allows when no limits configured", async () => {
    const { db } = createMockDb([], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ walletCount: 0 }]);

    const result = await checkAggregateRisk(db, 10000, 1000);
    expect(result.allowed).toBe(true);
    expect(result.limits).toBeNull();
  });

  it("returns result with allowed flag and reasons array", async () => {
    const limits = {
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "500",
      maxPendingWallets: 5,
      maxFailedTxPerDay: 3,
      enabled: true,
    };
    const { db } = createMockDb([limits], [{
      totalTradeUsd: "0",
      totalGasUsd: "0",
      activeWalletCount: 1,
      failedTxCount: 0,
    }], [{ walletCount: 0 }]);

    const result = await checkAggregateRisk(db, 50, 5);
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("reasons");
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it("calculates pending exposure from normalized USD fields, not raw token units", async () => {
    const { db } = createInMemoryDb({
      aggregateRiskLimits: [
        {
          id: "limits-1",
          chainId: 8453,
          maxDailyTradeUsd: "10000",
          maxDailyGasUsd: "1000",
          maxPendingTradeUsd: "100",
          maxPendingWallets: 10,
          maxFailedTxPerDay: 5,
          enabled: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      transactions: [
        {
          id: "tx-usdc",
          walletId: "wallet-usdc",
          pairId: null,
          chainId: 8453,
          txHash: "0x1",
          status: "SUBMITTED",
          action: "SWAP",
          amountIn: "1000000000000000000000000000000",
          amountInRaw: "1000000000000000000000000000000",
          amountInUsd: "25.00",
          amountOutRaw: null,
          amountOutUsd: null,
          gasUsd: "1.00",
          createdAt: new Date("2026-01-01T01:00:00.000Z"),
          updatedAt: new Date("2026-01-01T01:00:00.000Z"),
        },
        {
          id: "tx-weth",
          walletId: "wallet-weth",
          pairId: null,
          chainId: 8453,
          txHash: "0x2",
          status: "STUCK",
          action: "SWAP",
          amountIn: "500000000000000000",
          amountInRaw: "500000000000000000",
          amountInUsd: "20.00",
          amountOutRaw: null,
          amountOutUsd: null,
          gasUsd: "2.00",
          createdAt: new Date("2026-01-01T02:00:00.000Z"),
          updatedAt: new Date("2026-01-01T02:00:00.000Z"),
        },
      ],
    });

    const result = await checkAggregateRisk(db as never, 40, 1);

    expect(result.allowed).toBe(true);
    expect(result.stats.totalPendingUsd).toBe("45.00");
  });

  it("rejects when pending normalized USD exceeds the configured cap", async () => {
    const { db } = createInMemoryDb({
      aggregateRiskLimits: [
        {
          id: "limits-1",
          chainId: 8453,
          maxDailyTradeUsd: "10000",
          maxDailyGasUsd: "1000",
          maxPendingTradeUsd: "50",
          maxPendingWallets: 10,
          maxFailedTxPerDay: 5,
          enabled: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      transactions: [
        {
          id: "tx-1",
          walletId: "wallet-1",
          pairId: null,
          chainId: 8453,
          txHash: "0x1",
          status: "SUBMITTED",
          action: "SWAP",
          amountInRaw: "10000000",
          amountInUsd: "40.00",
          gasUsd: "1.00",
          createdAt: new Date("2026-01-01T01:00:00.000Z"),
          updatedAt: new Date("2026-01-01T01:00:00.000Z"),
        },
      ],
    });

    const result = await checkAggregateRisk(db as never, 15, 1);

    expect(result.allowed).toBe(false);
    expect(result.codes).toContain(
      AGGREGATE_RISK_CODES.pendingTradeLimitExceeded
    );
  });

  it("creates a serializable aggregate risk snapshot", async () => {
    const { db } = createInMemoryDb({
      aggregateRiskLimits: [
        {
          id: "limits-1",
          chainId: 8453,
          maxDailyTradeUsd: "100",
          maxDailyGasUsd: "10",
          maxPendingTradeUsd: "50",
          maxPendingWallets: 2,
          maxFailedTxPerDay: 1,
          enabled: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const result = await checkAggregateRisk(db as never, 10, 1);
    const snapshot = createAggregateRiskSnapshot(result);

    expect(snapshot.checkedAt).toEqual(expect.any(String));
    expect(snapshot.allowed).toBe(true);
    expect(snapshot.proposedTradeUsd).toBe("10.00");
  });
});
