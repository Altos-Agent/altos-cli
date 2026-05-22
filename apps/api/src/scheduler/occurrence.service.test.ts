import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import {
  aggregateRiskReservations,
  aggregateRiskLimits,
  wallets,
  pairs,
  tokens,
  scheduleOccurrences,
  walletSchedules,
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

const seedTestSchedule = async (db: TestDb, walletId: string) => {
  const id = "test-schedule-1111-1111-1111-111111111111";
  await db.insert(walletSchedules).values({
    id,
    walletId,
    enabled: true,
  });
  return id;
};

import {
  createOrGetOccurrence,
  generateOccurrenceKey,
  reconcileStaleOccurrences,
} from "./occurrence.service.js";

describe("occurrence service", () => {
  let db: TestDb;
  let walletId: string;
  let pairId: string;
  let scheduleId: string;

  beforeEach(async () => {
    db = createTestDb();
    walletId = await seedTestWallet(db);
    pairId = await seedTestPair(db);
    scheduleId = await seedTestSchedule(db, walletId);
  });

  afterEach(async () => {
    await cleanTestDb(db);
  });

  it("generateOccurrenceKey creates deterministic key", () => {
    const scheduledFor = new Date("2026-01-15T10:30:00Z");
    const key1 = generateOccurrenceKey(scheduleId, walletId, pairId, "DRY_RUN", scheduledFor);
    const key2 = generateOccurrenceKey(scheduleId, walletId, pairId, "DRY_RUN", scheduledFor);
    expect(key1).toBe(key2);
    expect(key1).toContain("occ_");
    expect(key1).toContain(scheduleId);
  });

  it("generateOccurrenceKey differs by mode", () => {
    const scheduledFor = new Date("2026-01-15T10:30:00Z");
    const dryRunKey = generateOccurrenceKey(scheduleId, walletId, pairId, "DRY_RUN", scheduledFor);
    const liveKey = generateOccurrenceKey(scheduleId, walletId, pairId, "LIVE", scheduledFor);
    expect(dryRunKey).not.toBe(liveKey);
  });

  it("generateOccurrenceKey differs by scheduleId", () => {
    const scheduledFor = new Date("2026-01-15T10:30:00Z");
    const key1 = generateOccurrenceKey(scheduleId, walletId, pairId, "DRY_RUN", scheduledFor);
    const key2 = generateOccurrenceKey("different-schedule", walletId, pairId, "DRY_RUN", scheduledFor);
    expect(key1).not.toBe(key2);
  });

  it("createOrGetOccurrence inserts a new occurrence", async () => {
    const scheduledFor = new Date();

    const { occurrence, created } = await createOrGetOccurrence(db, {
      scheduleId,
      walletId,
      pairId,
      mode: "DRY_RUN",
      scheduledFor,
    });

    expect(occurrence).toBeDefined();
    expect(occurrence.scheduleId).toBe(scheduleId);
    expect(occurrence.walletId).toBe(walletId);
    expect(occurrence.pairId).toBe(pairId);
    expect(occurrence.mode).toBe("DRY_RUN");
    expect(occurrence.status).toBe("PLANNED");
    expect(created).toBe(true);
  });

  it("createOrGetOccurrence returns same occurrence for same key", async () => {
    const scheduledFor = new Date();

    const { occurrence: occ1 } = await createOrGetOccurrence(db, {
      scheduleId,
      walletId,
      pairId,
      mode: "DRY_RUN",
      scheduledFor,
    });

    const { occurrence: occ2 } = await createOrGetOccurrence(db, {
      scheduleId,
      walletId,
      pairId,
      mode: "DRY_RUN",
      scheduledFor,
    });

    // Both calls should return the same occurrence key
    expect(occ1.occurrenceKey).toBe(occ2.occurrenceKey);
  });

  it("LIVE occurrence has LIVE mode", async () => {
    const scheduledFor = new Date();

    const { occurrence } = await createOrGetOccurrence(db, {
      scheduleId,
      walletId,
      pairId,
      mode: "LIVE",
      scheduledFor,
    });

    expect(occurrence.mode).toBe("LIVE");
  });
});