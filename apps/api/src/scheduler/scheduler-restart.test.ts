import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import {
  aggregateRiskReservations,
  aggregateRiskLimits,
  wallets,
  pairs,
  tokens,
} from "../db/schema.js";

type TestDb = ReturnType<typeof createInMemoryDb>["db"];

const createTestDb = () => {
  const result = createInMemoryDb();
  return result.db;
};

const cleanTestDb = async (_db: TestDb) => {
  // No cleanup needed for in-memory
};

const seedTestWallet = async (db: TestDb) => {
  const id = "test-wallet-1111-1111-1111-111111111111";
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

const seedTestPair = async (db: TestDb) => {
  const tokenInId = "test-token-in-1111-1111-1111-111111111111";
  const tokenOutId = "test-token-out-1111-1111-1111-111111111111";
  const pairId = "test-pair-1111-1111-1111-111111111111";

  await db.insert(tokens).values({
    id: tokenInId,
    chainId: 8453,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
  });

  await db.insert(tokens).values({
    id: tokenOutId,
    chainId: 8453,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  });

  await db.insert(pairs).values({
    id: pairId,
    tokenIn: tokenInId,
    tokenOut: tokenOutId,
    chainId: 8453,
    enabled: true,
  });

  return pairId;
};

import { expireStaleRiskReservations } from "./aggregate-risk-reservations.js";

describe("scheduler restart safety", () => {
  let db: TestDb;
  let walletId: string;
  let pairId: string;

  beforeEach(async () => {
    db = createTestDb();
    walletId = await seedTestWallet(db);
    pairId = await seedTestPair(db);
  });

  afterEach(async () => {
    await cleanTestDb(db);
  });

  it("expireStaleRiskReservations ignores CONSUMED entries", async () => {
    // Insert a CONSUMED reservation (should not be touched regardless of expiration)
    await db.insert(aggregateRiskReservations).values({
      id: "consumed-risk-1",
      traceId: "trace-consumed",
      walletId,
      pairId,
      amountUsd: "100.00",
      gasUsd: "10.00",
      status: "CONSUMED",
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 120_000),
    });

    const count = await expireStaleRiskReservations(db, 30_000);
    expect(count).toBe(0); // CONSUMED status not touched
  });

  it("expireStaleRiskReservations ignores RELEASED entries", async () => {
    // Insert a RELEASED reservation (should not be touched regardless of expiration)
    await db.insert(aggregateRiskReservations).values({
      id: "released-risk-1",
      traceId: "trace-released",
      walletId,
      pairId,
      amountUsd: "100.00",
      gasUsd: "10.00",
      status: "RELEASED",
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 120_000),
    });

    const count = await expireStaleRiskReservations(db, 30_000);
    expect(count).toBe(0); // RELEASED status not touched
  });

  it("aggregate risk reservations table has correct structure for status tracking", async () => {
    // Verify the schema includes all required fields for safety checks
    await db.insert(aggregateRiskReservations).values({
      id: "structure-test-1",
      traceId: "trace-structure",
      walletId,
      pairId,
      amountUsd: "50.00",
      gasUsd: "5.00",
      status: "RESERVED",
      expiresAt: new Date(Date.now() + 300_000),
      createdAt: new Date(),
    });

    const [inserted] = await db.select().from(aggregateRiskReservations).where(
      eq(aggregateRiskReservations.id, "structure-test-1")
    );

    expect(inserted).toBeDefined();
    expect(inserted.status).toBe("RESERVED");
    expect(inserted.walletId).toBe(walletId);
    expect(inserted.pairId).toBe(pairId);
  });
});