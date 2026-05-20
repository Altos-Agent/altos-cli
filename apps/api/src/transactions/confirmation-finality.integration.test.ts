import { describe, expect, it } from "vitest";
import type { TransactionReceipt } from "viem";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { refreshTransactionConfirmation } from "./confirmation.js";

const txHash =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const submittedTransaction = () => ({
  id: "tx-finality",
  walletId: "wallet-1",
  pairId: null,
  chainId: 8453,
  txHash,
  status: "SUBMITTED" as const,
  action: "SWAP" as const,
  router: "0x",
  tokenIn: "USDC",
  tokenOut: "WETH",
  amountIn: "1000000",
  amountOut: null,
  gasUsed: null,
  gasUsd: "1.00",
  feeNative: null,
  errorMessage: null,
  basescanUrl: null,
  confirmationCount: 0,
  finalizedBlock: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const receipt = {
  status: "success",
  gasUsed: 21000n,
  blockNumber: 100n,
} as TransactionReceipt;

describe("transaction confirmation finality", () => {
  it("keeps a transaction pending finality before required confirmations", async () => {
    process.env.CONFIRMATIONS_REQUIRED = "3";
    const { db } = createInMemoryDb({
      transactions: [submittedTransaction()],
    });

    const result = await refreshTransactionConfirmation(db as never, "tx-finality", {
      getTransactionReceipt: async () => receipt,
      getBlockNumber: async () => 101n,
    });

    expect(result.transaction.status).toBe("CONFIRMED_PENDING_FINALITY");
    expect(result.transaction.confirmationCount).toBe(2);
    expect(result.transaction.finalizedBlock).toBeNull();
  });

  it("finalizes a transaction after required confirmations", async () => {
    process.env.CONFIRMATIONS_REQUIRED = "3";
    const { db } = createInMemoryDb({
      transactions: [submittedTransaction()],
    });

    const result = await refreshTransactionConfirmation(db as never, "tx-finality", {
      getTransactionReceipt: async () => receipt,
      getBlockNumber: async () => 102n,
    });

    expect(result.transaction.status).toBe("FINALIZED");
    expect(result.transaction.confirmationCount).toBe(3);
    expect(result.transaction.finalizedBlock).toBe("102");
  });

  it("returns an operator reorg audit placeholder for finalized transactions", async () => {
    process.env.TX_REORG_LOOKBACK_BLOCKS = "12";
    const { db } = createInMemoryDb({
      transactions: [
        {
          ...submittedTransaction(),
          status: "FINALIZED",
          finalizedBlock: "102",
          confirmationCount: 3
        }
      ],
    });

    const result = await refreshTransactionConfirmation(db as never, "tx-finality", {
      getTransactionReceipt: async () => receipt,
      getBlockNumber: async () => 110n,
    });

    expect(result).toMatchObject({
      refreshed: false,
      reason:
        "Finalized transaction reorg detection is operator-guided within configured lookback"
    });
  });

  it("marks missing receipts as stuck before dropping them", async () => {
    process.env.TX_STUCK_AFTER_MINUTES = "15";
    process.env.TX_DROPPED_AFTER_MINUTES = "60";
    const { db } = createInMemoryDb({
      transactions: [
        {
          ...submittedTransaction(),
          createdAt: new Date(Date.now() - 16 * 60 * 1000),
          nonce: 7,
          fromAddress: "0x0000000000000000000000000000000000000001"
        }
      ],
    });

    const result = await refreshTransactionConfirmation(db as never, "tx-finality", {
      getTransactionReceipt: async () => {
        throw new Error("not found");
      },
      getBlockNumber: async () => 101n,
    });

    expect(result.transaction.status).toBe("STUCK");
    expect(result.transaction.droppedReason).toContain(
      "replacement detection requires operator review for nonce 7"
    );
  });

  it("marks missing receipts as dropped after the dropped timeout", async () => {
    process.env.TX_STUCK_AFTER_MINUTES = "15";
    process.env.TX_DROPPED_AFTER_MINUTES = "60";
    const { db } = createInMemoryDb({
      transactions: [
        {
          ...submittedTransaction(),
          createdAt: new Date(Date.now() - 61 * 60 * 1000)
        }
      ],
    });

    const result = await refreshTransactionConfirmation(db as never, "tx-finality", {
      getTransactionReceipt: async () => {
        throw new Error("not found");
      },
      getBlockNumber: async () => 101n,
    });

    expect(result.transaction.status).toBe("DROPPED");
    expect(result.transaction.droppedReason).toContain(
      "transaction may be dropped or replaced"
    );
  });
});
