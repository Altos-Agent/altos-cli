import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import {
  hashObject,
  TransactionManager
} from "./transaction-manager.js";
import type { TransactionManagerError } from "./transaction-manager.js";

const walletId = "00000000-0000-4000-8000-000000000001";

describe("transaction manager", () => {
  it("replays the same idempotency key and same request hash", async () => {
    const { db } = createInMemoryDb();
    const manager = new TransactionManager(db as never);
    const requestHash = hashObject({ walletId, amount: "1" });

    const first = await manager.createOrReplayRequest({
      idempotencyKey: "same-key",
      walletId,
      action: "SWAP",
      requestHash
    });
    const second = await manager.createOrReplayRequest({
      idempotencyKey: "same-key",
      walletId,
      action: "SWAP",
      requestHash
    });

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.request.id).toBe(first.request.id);
  });

  it("rejects same idempotency key with a different request hash", async () => {
    const { db } = createInMemoryDb();
    const manager = new TransactionManager(db as never);
    await manager.createOrReplayRequest({
      idempotencyKey: "conflict-key",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "1" })
    });

    await expect(
      manager.createOrReplayRequest({
        idempotencyKey: "conflict-key",
        walletId,
        action: "SWAP",
        requestHash: hashObject({ amount: "2" })
      })
    ).rejects.toMatchObject({
      statusCode: 409
    } satisfies Partial<TransactionManagerError>);
  });

  it("blocks a second active lock for the same wallet", async () => {
    const { db } = createInMemoryDb();
    const manager = new TransactionManager(db as never);
    const first = await manager.createOrReplayRequest({
      idempotencyKey: "lock-1",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "1" })
    });
    const second = await manager.createOrReplayRequest({
      idempotencyKey: "lock-2",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "2" })
    });

    await manager.acquireWalletLock({
      walletId,
      requestId: first.request.id
    });

    await expect(
      manager.acquireWalletLock({
        walletId,
        requestId: second.request.id
      })
    ).rejects.toMatchObject({
      statusCode: 409
    } satisfies Partial<TransactionManagerError>);
  });

  it("allows a new lock after rejection releases the previous one", async () => {
    const { db } = createInMemoryDb();
    const manager = new TransactionManager(db as never);
    const first = await manager.createOrReplayRequest({
      idempotencyKey: "release-1",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "1" })
    });
    const second = await manager.createOrReplayRequest({
      idempotencyKey: "release-2",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "2" })
    });

    await manager.acquireWalletLock({
      walletId,
      requestId: first.request.id
    });
    await manager.releaseWalletLock({
      walletId,
      requestId: first.request.id
    });

    await expect(
      manager.acquireWalletLock({
        walletId,
        requestId: second.request.id
      })
    ).resolves.toMatchObject({
      walletId,
      lockedByRequestId: second.request.id,
      status: "ACTIVE"
    });
  });

  it("keeps the wallet lock visible while a request is submitted", async () => {
    const { db } = createInMemoryDb();
    const manager = new TransactionManager(db as never);
    const request = await manager.createOrReplayRequest({
      idempotencyKey: "submitted-1",
      walletId,
      action: "SWAP",
      requestHash: hashObject({ amount: "1" })
    });

    await manager.acquireWalletLock({
      walletId,
      requestId: request.request.id,
      nonce: 7
    });
    await manager.updateRequestStatus(request.request.id, "SUBMITTED");

    await expect(manager.getWalletPending(walletId)).resolves.toMatchObject({
      lock: {
        walletId,
        lockedByRequestId: request.request.id,
        nonce: 7,
        status: "ACTIVE"
      },
      request: {
        id: request.request.id,
        status: "SUBMITTED"
      }
    });
  });

  it("reports submitted and pending-finality transactions as blocking live writes", async () => {
    const { db } = createInMemoryDb({
      transactions: [
        {
          id: "tx-submitted",
          walletId,
          pairId: null,
          chainId: 8453,
          status: "SUBMITTED",
          action: "SWAP",
          txHash:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
          requestId: null,
          nonce: 3,
          fromAddress: "0x0000000000000000000000000000000000000001",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ]
    });
    const manager = new TransactionManager(db as never);

    await expect(manager.assertNoPendingLiveTransaction(walletId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Wallet already has a submitted or pending-finality transaction"
    } satisfies Partial<TransactionManagerError>);
  });
});
