import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import {
  pendingWalletLocks,
  wallets,
  transactionRequests,
} from "../db/schema.js";

type TestDb = ReturnType<typeof createInMemoryDb>["db"];

const createTestDb = () => {
  const result = createInMemoryDb();
  return result.db;
};

const cleanTestDb = async (db: TestDb) => {
  // No cleanup needed for in-memory
};

const seedTestWallet = async (db: TestDb) => {
  const id = "test-wallet-2222-2222-2222-222222222222";
  await db.insert(wallets).values({
    id,
    name: "Test Wallet",
    address: "0x1234567890123456789012345678901234567890",
    encryptedPrivateKey: "encrypted",
    encryptionVersion: 1,
    status: "ACTIVE",
  });
  return id;
};

const seedTestTransactionRequest = async (db: TestDb, requestId: string) => {
  await db.insert(transactionRequests).values({
    id: requestId,
    idempotencyKey: `idem-${requestId}`,
    walletId: "test-wallet-2222-2222-2222-222222222222",
    action: "SWAP",
    requestHash: "0xabc123",
  });
};

describe("wallet lock atomic", () => {
  let db: TestDb;
  let walletId: string;

  beforeEach(async () => {
    db = createTestDb();
    walletId = await seedTestWallet(db);
  });

  afterEach(async () => {
    await cleanTestDb(db);
  });

  it("should acquire RESERVED lock", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
      finalityRequired: false,
    });

    expect(lock.status).toBe("RESERVED");
    expect(lock.nonce).toBe(0);
    expect(lock.walletId).toBe(walletId);
  });

  it("should transition RESERVED -> SIGNING -> SUBMITTED", async () => {
    const { acquireWalletLockAtomic, transitionWalletLock } = await import("./wallet-lock-atomic.js");

    await seedTestTransactionRequest(db, "req-1");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
    });

    const signing = await transitionWalletLock(db, {
      lockId: lock.id,
      walletId,
      fromStates: ["RESERVED"],
      toState: "SIGNING",
    });
    expect(signing.status).toBe("SIGNING");

    const submitted = await transitionWalletLock(db, {
      lockId: lock.id,
      walletId,
      fromStates: ["SIGNING"],
      toState: "SUBMITTED",
    });
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("should reject invalid transition RESERVED -> SUBMITTED", async () => {
    const { acquireWalletLockAtomic, transitionWalletLock } = await import("./wallet-lock-atomic.js");

    await seedTestTransactionRequest(db, "req-2");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-2",
      lockReason: "SCHEDULER_TRADE",
    });

    await expect(
      transitionWalletLock(db, {
        lockId: lock.id,
        walletId,
        fromStates: ["RESERVED"],
        toState: "SUBMITTED",
      })
    ).rejects.toThrow(/Invalid transition/i);
  });

  it("should not acquire lock if wallet is quarantined", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    // Seed a quarantined wallet directly to avoid in-memory update() limitation
    const quarantinedWalletId = "test-quarantine-wallet-3333-3333-3333-333333333333";
    await db.insert(wallets).values({
      id: quarantinedWalletId,
      name: "Quarantined Wallet",
      address: "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
      encryptedPrivateKey: "encrypted",
      encryptionVersion: 1,
      status: "QUARANTINED",
      nonceStatus: "QUARANTINED",
    });

    await expect(
      acquireWalletLockAtomic(db, {
        walletId: quarantinedWalletId,
        requestId: "req-3",
        lockReason: "SCHEDULER_TRADE",
      })
    ).rejects.toThrow(/quarantined/i);
  });

  it("should attach occurrence and trace ids to lock", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    await seedTestTransactionRequest(db, "req-4");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-4",
      lockReason: "SCHEDULER_TRADE",
      occurrenceId: "occ-123",
      traceId: "trace-abc",
      riskReservationId: "risk-456",
    });

    expect(lock.occurrenceId).toBe("occ-123");
    expect(lock.traceId).toBe("trace-abc");
    expect(lock.riskReservationId).toBe("risk-456");
  });
});